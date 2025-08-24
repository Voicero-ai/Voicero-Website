import { Pinecone } from "@pinecone-database/pinecone";
import {
  buildHybridQueryVectors,
  shouldFallbackToCollections,
} from "./sparse/hybrid_query_tuning";

// Types for the search functions
export type QuestionClassification = {
  type: string;
  category: string;
  "sub-category": string;
  page?: string;
  interaction_type?: "sales" | "support" | "discounts" | "noneSpecified";
  action_intent?:
    | string
    | "purchase"
    | "track_order"
    | "get_orders"
    | "return_order"
    | "cancel_order"
    | "exchange_order"
    | "login"
    | "logout"
    | "generate_image"
    | "account_reset"
    | "account_management"
    | "scheduler"
    | "none";
};

// Separate reranking function for main content
export function rerankMainResults(
  results: any[],
  classification: QuestionClassification,
  query: string
) {
  // Enhance query with classification data but EXCLUDE type
  const enhancedQuery = `${query} ${classification.category} ${
    classification["sub-category"] || "discounts"
  }`;

  // Deduplicate results by handle
  const seenHandles = new Set();
  const dedupedResults = results.filter((result) => {
    if (seenHandles.has(result.metadata?.handle)) return false;
    seenHandles.add(result.metadata?.handle);
    return true;
  });

  // Calculate classification match scores
  const rerankedResults = dedupedResults.map((result) => {
    let classificationMatch = 0;
    let totalFields = 3;

    // Type match is most important
    if (result.metadata?.type === classification.type) {
      classificationMatch = 1; // Start with 1 for type match (instead of 2)

      // Only check category/subcategory if type matches
      if (result.metadata?.category === classification.category) {
        classificationMatch++;
      }
      if (
        result.metadata?.["sub-category"] === classification["sub-category"] ||
        classification["sub-category"] === "discounts" ||
        !result.metadata?.["sub-category"]
      ) {
        classificationMatch++;
      }
    }

    // Calculate base score
    let score = result.score || 0;

    // Apply type-based multipliers FIRST
    if (
      classification.type === "collection" &&
      result.metadata?.type === "collection"
    ) {
      score *= 30; // Strong boost for collections in collection queries
    } else if (result.metadata?.type === classification.type) {
      score *= 3; // Standard type match bonus
    }

    // Add classification match bonus
    score *= 1 + (classificationMatch / totalFields) * 2;

    // Add strong boost for exact product name matches
    if (result.metadata?.type === "product") {
      const productName = result.metadata?.title?.toLowerCase() || "";
      const queryName = query.toLowerCase();

      // Check for exact name match
      if (productName === queryName) {
        score *= 100; // Strong boost for exact name match
      } else if (
        productName.includes(queryName) ||
        queryName.includes(queryName)
      ) {
        score *= 10; // Moderate boost for partial name match
      }
    }

    return {
      ...result,
      rerankScore: score,
      classificationMatch: `${classificationMatch}/${totalFields}`,
    };
  });

  // Sort by rerank score
  return rerankedResults.sort((a, b) => b.rerankScore - a.rerankScore);
}

// Separate reranking function for QAs
export function rerankQAResults(
  results: any[],
  classification: QuestionClassification,
  query: string
) {
  // Enhance query with classification data but EXCLUDE type
  const enhancedQuery = `${query} ${classification.category} ${
    classification["sub-category"] || "discounts"
  }`;

  // No previous context needed
  let previousProductName = null;

  // Deduplicate results by question
  const seenQuestions = new Set();
  const dedupedResults = results.filter((result) => {
    if (seenQuestions.has(result.metadata?.question)) return false;
    seenQuestions.add(result.metadata?.question);
    return true;
  });

  // Calculate classification match scores
  const rerankedResults = dedupedResults.map((result) => {
    let classificationMatch = 0;
    let totalFields = 3;

    // Since we forced the metadata to match earlier, we can directly compare
    if (result.metadata.type === classification.type) {
      classificationMatch = 1; // Start with 1 for type match (instead of 2)
      if (result.metadata.category === classification.category) {
        classificationMatch++;
      }
      if (
        result.metadata["sub-category"] === classification["sub-category"] ||
        classification["sub-category"] === "discounts" ||
        !result.metadata["sub-category"]
      ) {
        classificationMatch++;
      }
    }

    // Calculate base score
    let score = result.score || 0;

    // Apply type-based multipliers FIRST
    if (
      classification.type === "collection" &&
      result.metadata?.type === "collection"
    ) {
      score *= 30; // Strong boost for collections in collection queries
    } else if (result.metadata?.type === classification.type) {
      score *= 3; // Standard type match bonus
    }

    // Add classification match bonus
    score *= 1 + (classificationMatch / totalFields) * 2;

    // Add strong boost for exact product name matches
    if (result.metadata?.type === "product") {
      const productName = result.metadata?.title?.toLowerCase() || "";
      const queryName = query.toLowerCase();

      // Check for exact name match
      if (productName === queryName) {
        score *= 100; // Strong boost for exact name match
      } else if (
        productName.includes(queryName) ||
        queryName.includes(productName)
      ) {
        score *= 10; // Moderate boost for partial name match
      }
    }

    return {
      ...result,
      rerankScore: score,
      classificationMatch: `${classificationMatch}/${totalFields}`,
    };
  });

  // Sort by rerank score
  return rerankedResults.sort((a, b) => b.rerankScore - a.rerankScore);
}

// Main search function
export async function performMainSearch(
  pinecone: Pinecone,
  website: any,
  question: string,
  queryDense: number[],
  querySparse: any,
  classification: QuestionClassification | null,
  useAllNamespaces: boolean = false,
  timeMarks: Record<string, number>
) {
  // Special handling for "noneSpecified" interaction type or useAllNamespaces flag - search across all namespaces
  if (useAllNamespaces) {
    console.log(
      "Using all namespaces search strategy for non-AIsynced website"
    );

    // Define the interaction types to search across
    const interactionTypes = ["sales", "support", "discounts"];
    console.log(
      `Vectorization strategy: searching across multiple namespaces: ${interactionTypes.join(
        ", "
      )}`
    );

    // Collect results from all interaction types
    const allResults = [];

    for (const type of interactionTypes) {
      // Ensure website is not null before accessing its properties
      if (!website) {
        console.error("Website is null, cannot create namespace");
        continue;
      }
      const typeNamespace = `${website.id}-${type}`;
      console.log(`Searching namespace: ${typeNamespace}`);

      try {
        // Special handling for collection queries
        if (classification?.type === "collection") {
          const collectionQuery = `collection ${question}`;
          const {
            denseScaled: collectionDense,
            sparseScaled: collectionSparse,
          } = await buildHybridQueryVectors(collectionQuery, {
            alpha: 0.6,
            featureSpace: 2_000_003,
          });

          const collectionSearchResponse = await pinecone
            .index("voicero-hybrid")
            .namespace(typeNamespace)
            .query({
              vector: collectionDense,
              sparseVector: collectionSparse,
              topK: 7,
              includeMetadata: true,
              filter: { type: { $in: ["collection", "product"] } },
            });

          // Add results if they exist
          if (collectionSearchResponse?.matches?.length > 0) {
            allResults.push(...collectionSearchResponse.matches);
          }
        }

        // Perform hybrid search in this namespace
        const tNsSearchStart = Date.now();
        const searchResponse = await pinecone
          .index("voicero-hybrid")
          .namespace(typeNamespace)
          .query({
            vector: queryDense,
            sparseVector: querySparse,
            topK: 7, // Reduced to get top results from each namespace
            includeMetadata: true,
            filter: { type: { $in: ["collection", "product"] } },
          });
        timeMarks[`ns:${typeNamespace}:searchMs`] = Date.now() - tNsSearchStart;

        // Add results if they exist
        if (searchResponse?.matches?.length > 0) {
          console.log(
            `Found ${searchResponse.matches.length} results in namespace ${typeNamespace}`
          );
          // Log the first 2 results for debugging
          if (searchResponse.matches.length > 0) {
            console.log(`First result from ${typeNamespace}:`, {
              id: searchResponse.matches[0].id,
              score: searchResponse.matches[0].score,
              type: searchResponse.matches[0].metadata?.type,
              title:
                searchResponse.matches[0].metadata?.title ||
                searchResponse.matches[0].metadata?.question,
            });

            if (searchResponse.matches.length > 1) {
              console.log(`Second result from ${typeNamespace}:`, {
                id: searchResponse.matches[1].id,
                score: searchResponse.matches[1].score,
                type: searchResponse.matches[1].metadata?.type,
                title:
                  searchResponse.matches[1].metadata?.title ||
                  searchResponse.matches[1].metadata?.question,
              });
            }
          }
          allResults.push(...searchResponse.matches);
        }
      } catch (error) {
        console.error(`Error searching namespace ${typeNamespace}:`, error);
        // Continue with other namespaces even if one fails
      }
    }

    // Deduplicate by ID
    const uniqueResults = [];
    const seenIds = new Set();

    for (const result of allResults) {
      if (!seenIds.has(result.id)) {
        seenIds.add(result.id);
        uniqueResults.push(result);
      }
    }

    console.log(
      `Combined ${allResults.length} results into ${uniqueResults.length} unique results`
    );

    // Ensure classification is not null before calling rerankMainResults
    if (!classification) {
      // Fall back to raw results if no classification
      return uniqueResults.map((result) => ({
        ...result,
        rerankScore: result.score || 0,
        classificationMatch: "0/3",
      }));
    }

    // Rerank combined results with classification
    return rerankMainResults(uniqueResults, classification, question);
  } else {
    // Standard search when interaction type is specified
    const mainNamespace = `${website.id}-${
      classification?.interaction_type || "discounts"
    }`;
    console.log(
      `Vectorization strategy: using specific namespace: ${mainNamespace}`
    );

    // Initialize allResults array for this branch
    const allResults = [];

    // Special handling for collection queries
    if (classification?.type === "collection") {
      const collectionQuery = `collection ${question}`;
      const { denseScaled: collectionDense, sparseScaled: collectionSparse } =
        await buildHybridQueryVectors(collectionQuery, {
          alpha: 0.6,
          featureSpace: 2_000_003,
        });

      const collectionSearchResponse = await pinecone
        .index("voicero-hybrid")
        .namespace(mainNamespace)
        .query({
          vector: collectionDense,
          sparseVector: collectionSparse,
          topK: 7,
          includeMetadata: true,
          filter: { type: { $in: ["collection", "product"] } },
        });

      // Add results if they exist
      if (collectionSearchResponse?.matches?.length > 0) {
        allResults.push(...collectionSearchResponse.matches);
      }
    }

    // Perform hybrid search in the main namespace
    const tMainSearchStart = Date.now();
    const searchResponse = await pinecone
      .index("voicero-hybrid")
      .namespace(mainNamespace)
      .query({
        vector: queryDense,
        sparseVector: querySparse,
        topK: 10,
        includeMetadata: true,
      });
    timeMarks.mainSearchMs = Date.now() - tMainSearchStart;

    // Add results if they exist
    if (searchResponse?.matches?.length > 0) {
      console.log(
        `Found ${searchResponse.matches.length} results in namespace ${mainNamespace}`
      );
      // Log the first 2 results for debugging
      if (searchResponse.matches.length > 0) {
        console.log(`First result from ${mainNamespace}:`, {
          id: searchResponse.matches[0].id,
          score: searchResponse.matches[0].score,
          type: searchResponse.matches[0].metadata?.type,
          title:
            searchResponse.matches[0].metadata?.title ||
            searchResponse.matches[0].metadata?.question,
        });

        if (searchResponse.matches.length > 1) {
          console.log(`Second result from ${mainNamespace}:`, {
            id: searchResponse.matches[1].id,
            score: searchResponse.matches[1].score,
            type: searchResponse.matches[1].metadata?.type,
            title:
              searchResponse.matches[1].metadata?.title ||
              searchResponse.matches[1].metadata?.question,
          });
        }
      }
      allResults.push(...searchResponse.matches);
    }

    // Ensure classification is not null before calling rerankMainResults
    if (!classification) {
      // Fall back to raw results if no classification
      return allResults.map((result) => ({
        ...result,
        rerankScore: result.score || 0,
        classificationMatch: "0/3",
      }));
    }

    // Rerank results with classification
    return rerankMainResults(allResults, classification, question);
  }
}

// QA search function
export async function performQASearch(
  pinecone: Pinecone,
  website: any,
  question: string,
  enhancedDense: number[],
  enhancedSparse: any,
  classification: QuestionClassification | null,
  useAllNamespaces: boolean = false,
  timeMarks: Record<string, number>
) {
  // Special handling for "noneSpecified" interaction type or useAllNamespaces flag - search across all namespaces
  if (useAllNamespaces) {
    console.log(
      "Using all QA namespaces search strategy for non-AIsynced website"
    );

    // Define the interaction types to search across
    const interactionTypes = ["sales", "support", "discounts"];
    console.log(
      `Vectorization strategy: searching across multiple namespaces: ${interactionTypes.join(
        ", "
      )}`
    );

    // Collect results from all interaction types
    const allResults = [];

    for (const type of interactionTypes) {
      // Ensure website is not null before accessing its properties
      if (!website) {
        console.error("Website is null, cannot create QA namespace");
        continue;
      }
      const typeNamespace = `${website.id}-${type}`;
      console.log(`Searching namespace: ${typeNamespace}`);

      try {
        // Perform hybrid search in this namespace
        const tNsSearchStart = Date.now();
        const searchResponse = await pinecone
          .index("voicero-hybrid")
          .namespace(typeNamespace)
          .query({
            vector: enhancedDense,
            sparseVector: enhancedSparse,
            topK: 7, // Get top 7 results from each namespace
            includeMetadata: true,
          });
        timeMarks[`ns:${typeNamespace}:searchMs`] = Date.now() - tNsSearchStart;

        // Add results if they exist
        if (searchResponse?.matches?.length > 0) {
          console.log(
            `Found ${searchResponse.matches.length} results in namespace ${typeNamespace}`
          );
          // Log the first 2 results for debugging
          if (searchResponse.matches.length > 0) {
            console.log(`First result from ${typeNamespace}:`, {
              id: searchResponse.matches[0].id,
              score: searchResponse.matches[0].score,
              title:
                searchResponse.matches[0].metadata?.title ||
                searchResponse.matches[0].metadata?.question,
            });

            if (searchResponse.matches.length > 1) {
              console.log(`Second result from ${typeNamespace}:`, {
                id: searchResponse.matches[1].id,
                score: searchResponse.matches[1].score,
                title:
                  searchResponse.matches[1].metadata?.title ||
                  searchResponse.matches[1].metadata?.question,
              });
            }
          }
          allResults.push(...searchResponse.matches);
        }
      } catch (error) {
        console.error(`Error searching namespace ${typeNamespace}:`, error);
        // Continue with other namespaces even if one fails
      }
    }

    // Deduplicate by question text if available
    const uniqueResults = [];
    const seenQuestions = new Set();

    for (const result of allResults) {
      const questionText = result.metadata?.question || result.id;
      if (!seenQuestions.has(questionText)) {
        seenQuestions.add(questionText);
        uniqueResults.push(result);
      }
    }

    console.log(
      `Combined ${allResults.length} results into ${uniqueResults.length} unique results`
    );

    // Add default classification to results before reranking
    uniqueResults.forEach((result) => {
      if (!result.metadata) {
        result.metadata = {};
      }

      // Force metadata to match classification for consistent reranking
      result.metadata.type = classification?.type || "discounts";
      result.metadata.category = classification?.category || "discounts";
      result.metadata["sub-category"] =
        classification?.["sub-category"] || "discounts";
    });

    // Ensure classification is not null before calling rerankQAResults
    if (!classification) {
      // Fall back to raw results if no classification
      return uniqueResults.map((result) => ({
        ...result,
        rerankScore: result.score || 0,
        classificationMatch: "0/3",
      }));
    }

    // Rerank combined results with classification
    return rerankMainResults(uniqueResults, classification, question);
  } else {
    // Standard search when interaction type is specified
    const mainNamespace = `${website.id}-${
      classification?.interaction_type || "discounts"
    }`;
    console.log(
      `Vectorization strategy: using specific namespace: ${mainNamespace}`
    );

    // Initialize allResults array for this branch
    const allResults = [];

    // Perform hybrid search in the main namespace
    const tSearchStart = Date.now();
    const searchResponse = await pinecone
      .index("voicero-hybrid")
      .namespace(mainNamespace)
      .query({
        vector: enhancedDense,
        sparseVector: enhancedSparse,
        topK: 7,
        includeMetadata: true,
      });
    timeMarks.searchMs = Date.now() - tSearchStart;

    // Add results if they exist
    if (searchResponse?.matches?.length > 0) {
      console.log(
        `Found ${searchResponse.matches.length} results in namespace ${mainNamespace}`
      );
      // Log the first 2 results for debugging
      if (searchResponse.matches.length > 0) {
        console.log(`First result from ${mainNamespace}:`, {
          id: searchResponse.matches[0].id,
          score: searchResponse.matches[0].score,
          title:
            searchResponse.matches[0].metadata?.title ||
            searchResponse.matches[0].metadata?.question,
        });

        if (searchResponse.matches.length > 1) {
          console.log(`Second result from ${mainNamespace}:`, {
            id: searchResponse.matches[1].id,
            score: searchResponse.matches[1].score,
            title:
              searchResponse.matches[1].metadata?.title ||
              searchResponse.matches[1].metadata?.question,
          });
        }
      }
      allResults.push(...searchResponse.matches);
    }

    // Add default classification to results before reranking
    allResults.forEach((result) => {
      if (!result.metadata) {
        result.metadata = {};
      }

      // Force metadata to match classification for consistent reranking
      result.metadata.type = classification?.type || "discounts";
      result.metadata.category = classification?.category || "discounts";
      result.metadata["sub-category"] =
        classification?.["sub-category"] || "discounts";
    });

    // Ensure classification is not null before calling rerankQAResults
    if (!classification) {
      // Fall back to raw results if no classification
      return allResults.map((result) => ({
        ...result,
        rerankScore: result.score || 0,
        classificationMatch: "0/3",
      }));
    }

    // Rerank results with classification
    return rerankMainResults(allResults, classification, question);
  }
}
