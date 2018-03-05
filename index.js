const config = require('config');
const fetch = require('node-fetch');
const fs = require('fs');
const google = require('googleapis');
const googleAuth = require('google-auth-library');
const readline = require('readline');
const sheets = google.sheets('v4');

// Auth stuff
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets'
];
const TOKEN_DIR =
  (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) +
  '/.credentials/';
const TOKEN_PATH = TOKEN_DIR + 'google-api-creds.json';

const OAUTH_CLIENT_PATH = './secrets/oauth_client.json';

let oauthCreds;

// hue stuff
const ipAddress = config.get('hue.ip');
const hueAppUsername = config.get('hue.appUsername');
const hueURL = `http://${ipAddress}/api/${hueAppUsername}/sensors`;

/**
 * NOTE: Taken from Google's examples and modified
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  var clientSecret = credentials.web.client_secret;
  var clientId = credentials.web.client_id;
  var redirectUrl = credentials.web.redirect_uris[0];
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function(err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      try {
        oauth2Client.credentials = JSON.parse(token);
        callback(oauth2Client);
      } catch (e) {
        getNewToken(oauth2Client, callback);
      }
    }
  });
}

/**
 * NOTE: Taken from Google's examples
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function(code) {
    rl.close();
    oauth2Client.getToken(code, function(err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * NOTE: Taken from Google's examples
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
}

/**
 * Fetches data from Hue API, parses it then saves to Google Sheets
 * @param {oauth2Client} auth
 */
function fetchAndSaveTemp(auth) {
  let appendReq = {
    spreadsheetId: config.get('sheets.id'),
    range: config.get('sheets.range'),
    insertDataOption: 'INSERT_ROWS',
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: []
    },
    auth: auth
  };

  fetch(hueURL)
    .then(res => {
      return res.json();
    })
    .then(data => {
      // grab all data from Hue API
      for (const [index, sensor] of Object.entries(data)) {
        if (sensor.type === 'ZLLTemperature') {
          // Push relevant info ONLY for Temperature sensors.
          appendReq.resource.values.push([
            sensor.state.lastupdated,
            sensor.uniqueid,
            sensor.state.temperature,
            sensor.state.temperature / 100
          ]);

          console.log(
            `Temperature of ${sensor.state.temperature / 100} at ${
              sensor.state.lastupdated
            } for sensor ${sensor.uniqueid}`
          );
        }
      }

      // Append data to spreadsheet
      sheets.spreadsheets.values.append(appendReq, function(err, response) {
        if (err) {
          console.error(err);
          return;
        }

        // TODO: Change code below to process the `response` object:
        console.log(JSON.stringify(response.body, null, 2));
      });
    });
}

/**
 * Reads the Google API OAuth creds and starts the process
 */
function start() {
  fs.readFile(OAUTH_CLIENT_PATH, function(err, data) {
    if (err) {
      throw err;
    }
    let clientCreds = JSON.parse(data);
    authorize(clientCreds, fetchAndSaveTemp);
  });
}

// bootstrap the program, for now
start();
