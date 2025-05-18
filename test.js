require('dotenv').config();
const { Connection } = require('tedious');

// Log your config (without password) to verify values
const configToLog = {
  server: process.env.DB_SERVER,
  user: process.env.DB_USER,
  database: process.env.DB_NAME
};
console.log('Attempting connection with:', configToLog);

const config = {
  server: process.env.DB_SERVER,
  authentication: {
    type: 'default',
    options: {
      userName: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    }
  },
  options: {
    database: process.env.DB_NAME,
    encrypt: true,
    trustServerCertificate: true,
    connectTimeout: 30000,
    rowCollectionOnRequestCompletion: true,
    // Adding detailed logging
    debug: {
      packet: true,
      data: true,
      payload: true,
      token: false,
      log: true
    }
  }
};

const connection = new Connection(config);

connection.on('connect', err => {
  if (err) {
    console.error('Connection error:', err);
    process.exit(1);
  } else {
    console.log('Connection successful!');
    
    // Try a simple query to further verify connection
    const request = new connection.Request('SELECT @@VERSION', (err, rowCount, rows) => {
      if (err) {
        console.error('Query error:', err);
      } else {
        console.log(`Retrieved ${rowCount} rows`);
        if (rows && rows.length > 0) {
          // Format the output
          let result = '';
          for (let col of rows[0]) {
            result += col.value + ' ';
          }
          console.log('SQL Server version:', result);
        }
      }
      
      // Close the connection
      connection.close();
    });
    
    connection.execSql(request);
  }
});

connection.on('error', err => {
  console.error('Connection error event:', err);
});

console.log('Initiating connection to database...');
connection.connect();