// Simple test script to explore platform storage buckets
import bucketExplorer from '../services/bucketExplorer.js';

// Set this to the bucket name you want to explore
const BUCKET_TO_EXPLORE = process.argv[2] || 'images';

async function runTests() {
  console.log('🔍 Checking available buckets...');
  const { buckets, error: bucketsError } = await bucketExplorer.listAllBuckets();
  
  if (bucketsError) {
    console.error('❌ Error listing buckets:', bucketsError);
    return;
  }
  
  if (!buckets || buckets.length === 0) {
    console.warn('⚠️ No buckets found in your configured storage project');
    return;
  }
  
  console.log(`✅ Found ${buckets.length} buckets:`);
  buckets.forEach(bucket => {
    console.log(`   - ${bucket.name} (${bucket.public ? 'public' : 'private'})`);
  });
  
  // Check if the specified bucket exists
  if (!buckets.some(b => b.name === BUCKET_TO_EXPLORE)) {
    console.warn(`⚠️ Specified bucket "${BUCKET_TO_EXPLORE}" was not found`);
    console.log('Available buckets:', buckets.map(b => b.name).join(', '));
    return;
  }
  
  console.log(`\n🔍 Listing contents of "${BUCKET_TO_EXPLORE}" bucket...`);
  const { files, error: filesError, publicUrls } = await bucketExplorer.listBucketContents(BUCKET_TO_EXPLORE);
  
  if (filesError) {
    console.error(`❌ Error listing files in "${BUCKET_TO_EXPLORE}":`, filesError);
    return;
  }
  
  if (!files || files.length === 0) {
    console.log(`📂 Bucket "${BUCKET_TO_EXPLORE}" is empty`);
    return;
  }
  
  console.log(`✅ Found ${files.length} items in the root of "${BUCKET_TO_EXPLORE}":`);
  
  // Count folders and files
  const folders = files.filter(f => f.id === null);
  const actualFiles = files.filter(f => f.id !== null);
  
  console.log(`   - ${folders.length} folders`);
  folders.forEach(folder => {
    console.log(`     📁 ${folder.name}`);
  });
  
  console.log(`   - ${actualFiles.length} files`);
  actualFiles.forEach(file => {
    const url = publicUrls[file.name] || 'No public URL';
    console.log(`     📄 ${file.name} (${formatBytes(file.metadata?.size || 0)}) - ${url}`);
  });
  
  // If there are folders, recursively explore one of them
  if (folders.length > 0) {
    const folderToExplore = folders[0].name;
    console.log(`\n🔍 Looking inside folder "${folderToExplore}"...`);
    
    const { files: subFiles, error: subError, publicUrls: subUrls } = 
      await bucketExplorer.listBucketContents(BUCKET_TO_EXPLORE, folderToExplore);
    
    if (subError) {
      console.error(`❌ Error listing files in "${BUCKET_TO_EXPLORE}/${folderToExplore}":`, subError);
    } else if (!subFiles || subFiles.length === 0) {
      console.log(`📂 Folder "${folderToExplore}" is empty`);
    } else {
      console.log(`✅ Found ${subFiles.length} items in "${folderToExplore}":`);
      subFiles.forEach(item => {
        if (item.id === null) {
          console.log(`     📁 ${item.name} (subfolder)`);
        } else {
          const url = subUrls[item.name] || 'No public URL';
          console.log(`     📄 ${item.name} (${formatBytes(item.metadata?.size || 0)}) - ${url}`);
        }
      });
    }
  }
  
  console.log('\n🔍 Recursively listing all files in the bucket...');
  const { files: allFiles, error: allFilesError } = await bucketExplorer.listAllFilesInBucket(BUCKET_TO_EXPLORE);
  
  if (allFilesError) {
    console.error(`❌ Error listing all files in "${BUCKET_TO_EXPLORE}":`, allFilesError);
  } else {
    console.log(`✅ Found ${allFiles.length} total files in all folders of "${BUCKET_TO_EXPLORE}":`);
    
    // Group files by folder for better display
    const filesByFolder = {};
    allFiles.forEach(file => {
      const folder = file.path.includes('/') 
        ? file.path.substring(0, file.path.lastIndexOf('/')) 
        : 'root';
      
      if (!filesByFolder[folder]) {
        filesByFolder[folder] = [];
      }
      filesByFolder[folder].push(file);
    });
    
    Object.keys(filesByFolder).forEach(folder => {
      console.log(`   📁 ${folder === 'root' ? 'Root folder' : folder} (${filesByFolder[folder].length} files)`);
      // Limit to 3 examples per folder to avoid cluttering the output
      const filesToShow = filesByFolder[folder].slice(0, 3);
      filesToShow.forEach(file => {
        console.log(`     📄 ${file.name} (${formatBytes(file.metadata?.size || 0)})`);
      });
      if (filesByFolder[folder].length > 3) {
        console.log(`     ... and ${filesByFolder[folder].length - 3} more files`);
      }
    });
  }
}

// Utility function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) {return '0 Bytes';}
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Unhandled error:', error);
}); 