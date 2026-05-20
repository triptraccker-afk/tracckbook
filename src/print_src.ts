import fs from 'fs';
import path from 'path';

function printAll(dir: string, indent = '') {
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      console.log(`${indent}${file}${stat.isDirectory() ? '/' : ''}`);
      if (stat.isDirectory()) {
        printAll(fullPath, indent + '  ');
      }
    }
  } catch (e) {}
}

console.log('Listing all files in workspace recursively:');
printAll(process.cwd());
