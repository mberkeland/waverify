const mysql = require('mysql2');
require('dotenv').config();
const axios = require('axios');
const gjwt = require('jsonwebtoken');
const vini = process.env.vidstoken
const baseurl = process.env.baseurl

var VIDS = axios.create({
    baseURL: baseurl,
    headers: {
        "Content-Type": "application/json",
    },
});
VIDS.interceptors.request.use(
    (request) => {
        request.headers['Authorization'] = 'Bearer ' + vini;
        return request;
    }
);
module.exports = {
    async getDb(nexmo, dbname = 'nexmo') { // Uses local .env file for credentials.
        if (!dbname || dbname.length < 1) {
            return null;  // Will return null if failure
        }
        //Ok, we have a DBName, let's return it if we have one already...
        if (dbs[dbname]) {
            return dbs[dbname];
        }
        const options = {
            host: process.env.dbhost,
            user: process.env.dbuser,
            password: process.env.dbpassword,
            database: dbname,
            waitForConnections: true,
            connectionLimit: 100,
            queueLimit: 0
        };
        console.log("Creating db pool for " + dbname);
        try {
            tmpconn = await mysql.createPool(options);
        } catch (err) {
            console.log("Error getting db handle for " + dbname);
            return;
        }
        try {
            await tmpconn.getConnection(function (err, conn) {
                if (err) {
                    console.error('error connecting dbname ' + dbname + ': ' + err.stack);
                    return;
                }
                console.log('Pool test connected as id ' + conn.threadId + ' for dbname=' + dbname);
                dbs[dbname] = tmpconn;
                tmpconn.releaseConnection(conn);
                console.log("Got new db for " + dbname);
            });
            return dbs[dbname];
        } catch (err) {
            console.log("Error connecting db handle for " + dbname);
            return;
        }
    },
    nidsLog: function (nexmo, demo = '', event = '', status = '', results = '', comment = '') {
        /*
            var st = "insert into log (userid,demo,accountid,event,status,results,comment) values (?,?,?,?,?,?,?)";
            dbconn.query(st, [nexmo.userid, demo, nexmo.accountid, event, status, results, comment], function (error, results, fields) 
            */
        VIDS.post("vidsLog", {
            userid: nexmo.userid, demo: demo, accountid: nexmo.accountid, event: event, status: status, results: results, comment: comment
        })
        return;
    },

    nexmoLogout: function (db, id) {

    },
    async getNexmo(userId) {
        resp = await VIDS.post("getVonage", {
            userid: userId
        })
        //console.log("getVonage response: ", resp.data)
        const attrs = resp.data;
        return attrs;
    },

    getIniStuff: function () {
        console.log("GetIniStuff")
        return new Promise((resolve, reject) => {
            VIDS.post("getIniStuff", {
            }).then((resp) => {
                //console.log("getIniStuff response: ", resp.data)
                const attrs = resp.data;
                resolve(attrs);
            });
        })
    },

    getBearerToken: function (req) {
        const token = req.header('Authorization').replace('Bearer', '').trim();
        return token;
    },

    async getNexmoFromNumber(nexmo, pto) {
        const attrs = {};
        return attrs;
    },

    getIdFromJWT: function (nexmo, jwt = '', req = {}) {
        if (!jwt.length) {
            console.log("jwt not passed into function, retrieve it.");
            jwt = this.getBearerToken(req);
        }
        if ((!jwt.length) && (jwt != "HARNESS")) {
            console.log("No jwt length after retrieval");
            return -1;
        }
        var payload;
        try {
            // Parse the JWT string and store the result in `payload`.
            // Note that we are passing the key in this method as well. This method will throw an error
            // if the token is invalid (if it has expired according to the expiry time we set on sign in),
            // or if the signature does not match
            payload = gjwt.verify(jwt, nexmo.tokenkey)
        } catch (e) {
            console.log(e);
            if (e instanceof gjwt.JsonWebTokenError) {
                // if the error thrown is because the JWT is unauthorized, return a 401 error
                return -1;
            }
            // otherwise, return a bad request error
            return -2;
        }
        return payload.userid;
    },
    getFromJWT: function (nexmo, jwt = '', param = 'userid') {
        if (!jwt.length) {
            console.log("jwt not passed into function, retrieve it.");
            jwt = this.getBearerToken(req);
        }
        if ((!jwt.length) && (jwt != "HARNESS")) {
            console.log("No jwt length after retrieval");
            return -1;
        }
        var payload;
        try {
            // Parse the JWT string and store the result in `payload`.
            // Note that we are passing the key in this method as well. This method will throw an error
            // if the token is invalid (if it has expired according to the expiry time we set on sign in),
            // or if the signature does not match
            payload = gjwt.verify(jwt, nexmo.tokenkey)
        } catch (e) {
            console.log(e);
            if (e instanceof gjwt.JsonWebTokenError) {
                // if the error thrown is because the JWT is unauthorized, return a 401 error
                return -1;
            }
            // otherwise, return a bad request error
            return -2;
        }
        return payload[param];
    },
    async registerWA(number, url, type = 'incoming') {
        // NOTE: Special Case scenario for MX (+52) numbers using "1" (mobile) addition...
        if (type == 'incoming' && ('' + number).startsWith('52') && ('' + number).charAt(2) != '1') {
            number = number.substring(0, 2) + '1' + number.substring(2);
        }
        request.post('https://vids.vonage.com/wa/register', {
            headers: {
                "content-type": "application/json",
            },
            json: true,
            body: {
                phone: number,
                url: url,
                type: type,
                service: "wa"
            },
        },
            function (error, response, body) {
                if (error) {
                    console.log("Error posting to WA redirector ", error);
                }
            }
        );
    }
}
