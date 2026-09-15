import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeMssqlPool, getMssqlPool } from '../api/mssql/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveScriptPath = (scriptPath) => {
  if (path.isAbsolute(scriptPath)) {
    return scriptPath;
  }

  const fromWorkingDirectory = path.resolve(process.cwd(), scriptPath);
  if (fs.existsSync(fromWorkingDirectory)) {
    return fromWorkingDirectory;
  }

  return path.resolve(__dirname, scriptPath);
};

const main = async () => {
  const requestedPath = process.argv[2];

  if (!requestedPath) {
    throw new Error('Please provide a SQL script path, for example: node src/db/executeSql.js ./migrations/example.sql');
  }

  const scriptPath = resolveScriptPath(requestedPath);
  console.log(`Executing SQL script: ${scriptPath}`);

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`File not found: ${scriptPath}`);
  }

  const sqlScript = fs.readFileSync(scriptPath, 'utf8');
  console.log(`SQL script loaded (${sqlScript.length} characters)`);

  const pool = await getMssqlPool();
  await pool.request().batch(sqlScript);
  console.log('SQL script executed successfully through the direct MSSQL connection.');
};

main()
  .catch((error) => {
    console.error('Error executing SQL script:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMssqlPool().catch((error) => {
      console.error('Error closing MSSQL pool:', error);
      process.exitCode = 1;
    });
  });
