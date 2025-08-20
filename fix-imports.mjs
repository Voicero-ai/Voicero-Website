#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to recursively get all files in a directory
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

// Function to fix imports in a file
function fixImportsInFile(filePath) {
  console.log(`Processing ${filePath}...`);
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Get the relative path from the file to the root
  const relativePath = path.relative(path.dirname(filePath), __dirname);
  
  // Replace @/lib/ imports with relative paths
  const libImportRegex = /from\s+['"]@\/lib\/([^'"]+)['"]/g;
  let newContent = content.replace(libImportRegex, (match, importPath) => {
    modified = true;
    return `from '${relativePath}/lib/${importPath}'`;
  });

  // Replace @/app/ imports with relative paths
  const appImportRegex = /import\s+['"]@\/app\/([^'"]+)['"]/g;
  newContent = newContent.replace(appImportRegex, (match, importPath) => {
    modified = true;
    return `import '${relativePath}/app/${importPath}'`;
  });
  
  // Replace @/components/ imports with relative paths
  const componentsImportRegex = /from\s+['"]@\/components\/([^'"]+)['"]/g;
  newContent = newContent.replace(componentsImportRegex, (match, importPath) => {
    modified = true;
    return `from '${relativePath}/components/${importPath}'`;
  });
  
  // Replace @/components/SEO imports (special case)
  const seoImportRegex = /from\s+['"]@\/components\/SEO['"]/g;
  const finalContent = newContent.replace(seoImportRegex, (match) => {
    modified = true;
    return `from '${relativePath}/components/SEO'`;
  });

  if (modified) {
    fs.writeFileSync(filePath, finalContent, 'utf8');
    console.log(`✅ Fixed imports in ${filePath}`);
    return true;
  }

  return false;
}

// Main function
function main() {
  console.log('Starting to fix imports...');
  
  // Get all TypeScript files in the app directory
  const appDir = path.join(__dirname, 'app');
  const allFiles = getAllFiles(appDir);
  
  let fixedCount = 0;
  
  // Fix imports in each file
  allFiles.forEach(file => {
    if (fixImportsInFile(file)) {
      fixedCount++;
    }
  });
  
  console.log(`\nDone! Fixed imports in ${fixedCount} files.`);
}

main();