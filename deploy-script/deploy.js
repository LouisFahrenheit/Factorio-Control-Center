const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();
const rootDir = path.resolve(__dirname, '..');

const filesToUpload = [
  'Dockerfile',
  '.dockerignore',
  'docker-compose.yml',
  'README.md',
  'README.ru.md'
];

conn.on('ready', () => {
  console.log('Client :: ready');
  
  // Step 1: Install git, docker, and docker-compose
  const setupCmd = `
    apt-get update &&
    apt-get install -y git docker.io docker-compose &&
    rm -rf /opt/factorio-control-center &&
    git clone https://github.com/LouisFahrenheit/Factorio-Control-Center.git /opt/factorio-control-center
  `;
  
  console.log('Executing setup commands...');
  conn.exec(setupCmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Setup finished with code: ' + code);
      
      // Step 2: Upload modified files
      conn.sftp((err, sftp) => {
        if (err) throw err;
        
        console.log('Uploading modified files...');
        let uploadedCount = 0;
        
        filesToUpload.forEach(file => {
          const localPath = path.join(rootDir, file);
          const remotePath = `/opt/factorio-control-center/${file}`;
          
          sftp.fastPut(localPath, remotePath, (err) => {
            if (err) {
              console.error(`Error uploading ${file}:`, err);
              throw err;
            }
            console.log(`Uploaded ${file}`);
            uploadedCount++;
            
            if (uploadedCount === filesToUpload.length) {
              console.log('All files uploaded successfully.');
              
              // Step 3: Build and Run Docker
              const dockerCmd = `
                cd /opt/factorio-control-center &&
                docker-compose up -d --build
              `;
              console.log('Building and starting Docker container...');
              conn.exec(dockerCmd, (err, dockerStream) => {
                if (err) throw err;
                dockerStream.on('close', (code) => {
                  console.log('Docker build/start finished with code: ' + code);
                  conn.end();
                }).on('data', (data) => {
                  process.stdout.write(data);
                }).stderr.on('data', (data) => {
                  process.stderr.write(data);
                });
              });
            }
          });
        });
      });
      
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect({
  host: '150.241.85.96',
  port: 22,
  username: 'root',
  password: 'S5%R4eO7Em4lu%?%'
});
