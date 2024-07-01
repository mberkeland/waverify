'use strict'
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser')
const app = express();
const axios = require('axios');
const expressWs = require('express-ws')(app);
const { Vonage } = require('@vonage/server-sdk');
const { tokenGenerate } = require('@vonage/jwt');
const { Text, CustomMessage, TemplateMessage } = require('@vonage/messages');
const { promisify } = require('util');
const request = require('request');
const path = require('path');
const Pusher = require("pusher");
const v2url = "https://api.nexmo.com/v2/verify/";
const fs = require("fs");

var pusher;

var images = [];
var vonage = [];
var silents = [];
var sid = 780;
const utils = require('./vutilsOrig');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const pchannel = "waverify";
var lang = "en-US";
const WHATSAPP_TEMPLATE_NAMESPACE = "whatsapp:hsm:technology:nexmo";
const WHATSAPP_TEMPLATE_NAME = "vids_wa_otp";
const WHATSAPP_TEMPLATE_SILENT = "silentauthwa1";

app.use(bodyParser.json());
app.use('/', express.static(__dirname));

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
    next();
});
var vonage;
var wvonage; // WhatsApp vonage instance
var svonage; // WhatsApp vonage instance
var users = [];
let phone = '';
var server_url;
var gnids;
try {
    gnids = utils.getIniStuff().then((res) => {
        console.log("Got ini")
        gnids = res;
        if (process.env.VCR_INSTANCE_PUBLIC_URL) {
            server_url = process.env.VCR_INSTANCE_PUBLIC_URL;

        } else {
            server_url = gnids.nserver + pchannel;  // Demo-specific URI element, for nginx to route correctly
            if (gnids.nserver.indexOf('ngrok') > 0) {
                server_url = gnids.nserver;
            };
        }
        console.log("Server URL: " + server_url);
    }).catch((err) => {
        console.log("Internal Error reading ini");
    })
} catch (err) {
    console.log("Error reading ini");
}
app.get('/_/health', async (req, res) => {
    res.sendStatus(200);
});

const sleep = promisify(setTimeout);
function getId(req) {
    var jwt = utils.getBearerToken(req);
    if (!jwt.length) {
        return -1;
    };
    var id = utils.getIdFromJWT(gnids, jwt);
    if (id <= 0) {
        return -1;
    }
    return id;
}
async function startup() {
    wvonage = new Vonage({
        apiKey: gnids['masterkey'], //NEXMO_API_KEY,
        apiSecret: gnids['mastersecret'], //NEXMO_API_SECRET,
        applicationId: gnids['masterapp'], //NEXMO_APPLICATION_ID,
        privateKey: gnids['masterkeyfile'], //NEXMO_APPLICATION_PRIVATE_KEY_PATH

    }, { debug: true });
    console.log("WA Master Object initialized");
    utils.getNexmo(sid).then((result) => {
        console.log("Creating Silent user record for " + sid);
        //console.log(result);
        users[sid] = result;
        users[sid].id = sid;
        users[sid].request_id = null;
        vonage[sid] = new Vonage({
            apiKey: result.key,
            apiSecret: result.secret,
            applicationId: result.app_id,
            privateKey: result.keyfile,
        }, {});
        vonage[sid].applications.updateApplication({
            id: result.app_id,
            name: "VIDS",
            capabilities: {
                verify: {
                    webhooks: {
                        status_url: {
                            address: server_url + "/verifystatus?uid=" + sid,
                            http_method: 'POST'
                        },
                    }, version: 'v2'
                }
            }
        }).then(result => {
            console.log(result.capabilities.verify);
        }).catch(error => {
            console.error(error);
        }
        );
    });
}
function push(uid, obj) {
    pusher.trigger(pchannel, `${pchannel}_` + uid, obj);
}
app.post("/event", (req, res) => {
    console.log("Got event!!!!", (req.body.status ? req.body.status : req.body));
    return res.status(200).end();
})
app.post("/inbound", (req, res) => {
    console.log("Got inbound!!!!", req.body);
    let id = 0;
    let uido = users.find((o) => {
        if (o && o.phone && (o.phone == req.body.to)) {
            return o;
        }
    });
    if (uido && uido.vonage) {
        id = uido.id;
    }
    return res.status(200).end();
})
app.post("/wainbound", (req, res) => {
    console.log("Got WA inbound!!!!", req.body);
    let uid = req.query.uid;
    if (!uid || !users[uid]) {
        console.log("Verify Status/Event sent with no uid");
        res.status(200).end();
        return;
    }
    push(uid, {
        event: 'button',
        timestamp: date,
        message: req.body,
    })
    return res.status(200).end();
})
app.post("/wastatus", (req, res) => {
    let uid = req.query.uid;
    if (!uid || !users[uid]) {
        console.log("Verify Status/Event sent with no uid");
        res.status(200).end();
        return;
    }
    push(uid, {
        event: 'button',
        timestamp: date,
        message: req.body,
    })
    return res.status(200).end();
})
app.post("/wa_status", (req, res) => {
    console.log("Got WA Status!!!!", req.body, req.query);
    var date = new Date().toLocaleString();
    return res.status(200).end();
})
function sendText(uid, msg) {
    wvonage.messages.send(
        new Text(
            msg,
            users[uid].phone,
            gnids.wanumber
        )
    )
        .then(resp => console.log('WA Message sent to ' + users[uid].phone + ': ' + msg))
        .catch(err => {
            console.error(err)
        });
}
function respondText(uid, msg, rawmsg) {
    push(uid, {
        event: users[uid].action,
        type: 'text',
        message: rawmsg,
    })
    sendText(uid, msg);
}
function gotButton(uid, value) {
    if ((!users[uid].button.timeout) || (users[uid].button.timeout < (Math.floor(new Date().getTime() / 1000)))) {
        let msg = 'Invalid Verification, or Verification Expired';
        console.log("Timeout: " + users[uid].button.timeout)
        users[uid].button.timeout = null;
        push(uid, {
            event: 'button',
            type: 'event',
            status: 'expired',
            message: msg,
        })
        sendText(uid, msg);
        return;
    }
    if (value == 'yes') {
        let msg = 'You are verified!';
        users[uid].button.timeout = null;
        push(uid, {
            event: 'button',
            status: 'verified',
            type: 'event',
            message: msg,
        })
        sendText(uid, msg);
        setTimeout(() => {
            sendText(uid, users[uid].button.success)
        }, 1000);
    }
    if (value == 'no') {
        let msg = 'Verification rejected!';
        users[uid].button.timeout = null;
        push(uid, {
            event: 'button',
            status: 'user_rejected',
            type: 'event',
            message: msg,
        })
        sendText(uid, msg);
        setTimeout(() => {
            sendText(uid, users[uid].button.reject)
        }, 1000);
    }
}
app.post("/wa_inbound", (req, res) => {
    console.log("Got WA Inbound!!!!", req.body, req.query);
    var date = new Date().toLocaleString();
    let uid = req.query.uid;
    if (!uid || !users[uid]) {
        console.log("WA Inbound sent with no uid");
        res.status(200).end();
        return;
    }
    if (req.body.message && req.body.message.content && req.body.message.content.type == 'button') {
        console.log("Button: ", req.body.message.content)
        gotButton(uid, req.body.message.content.button.payload)
    } else if (req.body.message_type && req.body.message_type == 'button') {
        gotButton(uid, req.body.button.payload)
    }
    let text = null;
    let thisphone = '';
    if (req.body.message && req.body.message.content && req.body.message.content.type == 'text') {
        text = req.body.message.content.text;
        thisphone = req.body.from.number;
    } else if (req.body.message_type && req.body.message_type == 'text') {
        text = req.body.text
        thisphone = req.body.from;
    }
    if (text) {
        console.log("Text: ", text);
        let pieces = text.split("Code=");

        if (users[uid].action == 'qr' && pieces[1]) {
            console.log("Got a QR Code response");
            if (users[uid].phone != thisphone) {
                let msg = "Response from unexpected device.  Not verified."
                push(uid, {
                    event: 'qr',
                    type: 'event',
                    status: 'unexpected',
                    message: msg,
                })
                sendText(uid, msg);
                return res.status(200).end();
            }
            if ((!users[uid].qr.timeout) || (users[uid].qr.timeout < (Math.floor(new Date().getTime() / 1000)))) {
                let msg = 'Invalid QR Verification, or Verification Expired';
                console.log("QR Timeout: " + users[uid].qr.timeout)
                users[uid].qr.timeout = null;
                push(uid, {
                    event: 'qr',
                    type: 'event',
                    status: 'expired',
                    message: msg,
                })
                sendText(uid, msg);
                return res.status(200).end();
            }
            if (pieces[1] == users[uid].qr.pin) {
                let msg = 'You are verified!';
                users[uid].qr.timeout = null;
                push(uid, {
                    event: 'qr',
                    status: 'verified',
                    type: 'event',
                    message: msg,
                })
                sendText(uid, msg);
                setTimeout(() => {
                    sendText(uid, "We may now carry on our conversation in this channel.  Please type whatever you want.")
                }, 1000);
            }
            else {
                let msg = 'Verification rejected!';
                users[uid].qr.timeout = null;
                push(uid, {
                    event: 'qr',
                    status: 'user_rejected',
                    type: 'event',
                    message: msg,
                })
                sendText(uid, msg);
                setTimeout(() => {
                    sendText(uid, "You used the wrong PIN, but we can still communicate on this channel if you have any questions.")
                }, 1000);
            }
            return res.status(200).end();
        }
        respondText(uid, "You said: '" + text + "'.  So, I respond with blah blah blah...", text)
    }
    return res.status(200).end();
})
app.post("/silent", async (req, res) => {
    console.log("Got silent!!!!", req.body, req.query);
    var date = new Date().toLocaleString();
    let id = req.query.id;
    if (!id) return res.status(200).end();
    let phonenumber = '14083753079';
    if (!silents[id]) {
        silents[id] = { phone: phonenumber }
    } else {
        phonenumber = silents[id].phone;
    }
    let sreq = await createRequest(phonenumber);
    return res.status(200).json(sreq);
})
async function createRequest(phoneNumber) {
    const brand = "VIDS"
    console.log("Creating silent_auth request for: ", phoneNumber);
    const body = {
        brand: brand, workflow: [
            { channel: "silent_auth", to: phoneNumber },
            //    {channel: "sms", to: phoneNumber},
            //    {channel: "voice", to: phoneNumber}
        ]
    };

    console.log("Sending V2 workflow: ", body)
    const jwt = tokenGenerate(users[sid].app_id, users[sid].keyfile, {})
    //console.log("jwt: " + jwt);
    var results;
    try {
        results = await axios.post(v2url, body,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + jwt
                }
            });
    } catch (err) {
        console.log("V2 Code error: ", err.response.status)
        return res.status(200).json({ results: '' + err.response.status, reason: err.response.data.detail });
    }
    console.log('createRequest', JSON.stringify(results))

    return { status: results.status, body: results }
}
app.post("/status", (req, res) => {
    console.log("Got status!!!!", req.body, req.query);
    var date = new Date().toLocaleString();
    return res.status(200).end();
})
app.post("/verimetrics", (req, res) => {
    console.log("Got verimetrics callback!!!!", req.body);
    var date = new Date().toLocaleString();
    let uid = req.query.uid;
    if (!uid || !users[uid]) {
        console.log("Verimetrics Inbound sent with no uid");
        res.status(200).end();
        return;
    }
    push(uid, {
        event: 'biometrics',
        timestamp: date,
        message: req.body,
    })
    return res.status(200).end();
})

app.post("/verifystatus", (req, res) => {
    console.log("Got Verify status!!!!", req.body);
    var date = new Date().toLocaleString();
    let uid = req.query.uid;
    if (!uid || !users[uid]) {
        console.log("Verify Status/Event sent with no uid");
        res.status(200).end();
        return;
    }
    if (req.body.type == 'summary') {
        push(uid, {
            event: 'v2',
            timestamp: date,
            request: req.body.request_id,
            status: req.body.status,
            type: req.body.type,
            message: req.body,
        })
    }
    if (req.body.type == 'event' && req.body.status == 'action_pending' && req.body.channel == 'silent_auth') {
        if (users[uid].phone) {
            let link = req.body.action.check_url.substring(req.body.action.check_url.indexOf('checks/') + 7);
            console.log("Sending link: " + link);
            doSilent(uid, link);
            //sendText(uid, "Silent Auth Link: " + req.body.action.check_url)
        }
    }
    if (req.body.type == 'event' && req.body.status == 'expired' && (req.body.channel == 'whatsapp_interactive' || req.body.channel == 'silent_auth')) {
        push(uid, {
            event: 'v2',
            timestamp: date,
            request: req.body.request_id,
            status: req.body.status,
            type: req.body.type,
            channel: req.body.channel,
            message: req.body,
        })
    }
    return res.status(200).end();
})

app.post("/register", async (req, res) => {
    var id = getId(req);
    if (id < 0) {
        return res.status(401).end();
    }
    let resp = {};
    var date = new Date().toLocaleString();
    console.log("WA Verify Register at " + date + " for " + id);
    utils.getNexmo(id).then((result) => {
        console.log("Creating user record for " + id);
        //console.log(result);
        users[id] = result;
        users[id].id = id;
        users[id].request_id = null;
        pusher = new Pusher({
            appId: result.pusher_id,
            key: result.pusher_key,
            secret: result.pusher_secret,
            useTLS: true, // optional, defaults to false
            cluster: "us3"
        });
        vonage[id] = new Vonage({
            apiKey: result.key,
            apiSecret: result.secret,
            applicationId: result.app_id,
            privateKey: Buffer.from(result.keyfile),
        }, {});
        vonage[id].applications.updateApplication({
            id: result.app_id,
            name: "VIDS",
            capabilities: {
                voice: {
                    webhooks: {
                        answer_url: {
                            address: server_url + "/answer?uid=" + id,
                            http_method: "GET"
                        },
                        event_url: {
                            address: server_url + "/event?uid=" + id,
                            http_method: "POST"
                        }
                    },
                },
                messages: {
                    webhooks: {
                        inbound_url: {
                            address: server_url + "/inbound?uid=" + id,
                            http_method: "POST"
                        },
                        status_url: {
                            address: server_url + "/status?uid=" + id,
                            http_method: "POST"
                        }
                    }
                },
                verify: {
                    webhooks: {
                        status_url: {
                            address: server_url + "/verifystatus?uid=" + id,
                            http_method: 'POST'
                        },
                    }, version: 'v2'
                }
            }
        }).then(result => {
            console.log(result.capabilities.verify);
        }).catch(error => {
            console.error(error);
        }
        );
    });
    res.status(200).json(resp);
})
app.post("/v2", async (req, res) => {
    var id = getId(req);
    if ((id < 0) || !users[id]) {
        return res.status(401).end();
    }
    let resp = {};
    var date = new Date().toLocaleString();
    console.log("V2 request at " + date + " for " + id);
    let phone = req.body.phone;
    users[id].action = 'v2';
    users[id].phone = phone;
    users[id].brand = req.body.brand;
    users[id].email = req.body.email;
    users[id].steps = req.body.steps
    var force = false;
    let workflow = [];
    if (!users[id].steps) {
        workflow.push({
            channel: "whatsapp_interactive",
            to: phone
        }
        )
    } else {
        users[id].steps.forEach((step) => {
            if (step.use) {
                var chan = {
                    channel: step.channel,
                    to: (step.channel == 'email' ? users[id].email : users[id].phone),
                };
                if (step.channel == 'whatsapp') {
                    chan.from = gnids.wanumber
                    force = true;
                }
                workflow.push(chan)
            }
        });
    }
    let body = {
        brand: req.body.brand,
        channel_timeout: req.body.timeout,
        workflow: workflow
    }
    console.log("Sending V2 workflow: ", body)
    var jwt = tokenGenerate(users[id].app_id, users[id].keyfile, {})
    if (force) {
        //        var keyfile = '' + fs.readFileSync(gnids.masterkeyfile);
        //        jwt = tokenGenerate(gnids['masterapp'], Buffer.from(keyfile), {})
        jwt = tokenGenerate(users[sid].app_id, users[sid].keyfile, {})
    }
    //console.log("jwt: " + jwt);
    var results;
    try {
        results = await axios.post(v2url, body,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + jwt
                }
            });
    } catch (err) {
        console.log("V2 Code error: ", err.response.data)
        return res.status(200).json({ results: '' + err.response.status, reason: err.response.data.detail });
    }
    let vid = null;
    console.log("Results of request: ", results.data);
    if (results.data && results.data.request_id) {
        vid = results.data.request_id;
    }
    users[id].request_id = vid;
    res.status(200).json({ id: vid });
})
app.post("/v2code", async (req, res) => {
    var id = getId(req);
    if ((id < 0) || !users[id] || !users[id].request_id || !req.body.code) {
        return res.status(200).end();
    }
    let resp = {};
    var date = new Date().toLocaleString();
    console.log("V2 code received at " + date + " for " + id + " code=" + req.body.code);
    const jwt = tokenGenerate(users[id].app_id, users[id].keyfile, {})
    var results;
    try {
        results = await axios.post(v2url + users[id].request_id, { code: '' + req.body.code },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + jwt
                }
            });
    } catch (err) {
        console.log("V2 Code error: ", err.response.status)
        return res.status(200).json({ results: '' + err.response.status, reason: err.response.data.detail });
    }
    console.log("Results of request: ", results.status);
    return res.status(200).json({ results: '' + results.status, reason: "Success" });
})
async function doSilent(uid, auth) {
    let mtmpl = new CustomMessage(
        {
            type: "template",
            template: {
                namespace: `${WHATSAPP_TEMPLATE_NAMESPACE}`,
                name: `${WHATSAPP_TEMPLATE_SILENT}`,
                language: {
                    policy: 'deterministic',
                    code: 'en',
                },
                components: [
                    {
                        type: 'header',
                        parameters: [
                            {
                                type: "image",
                                image: {
                                    link: "https://vids.vonage.com/vonage_white_on_black.png"
                                }
                            }
                        ],
                    },
                    {
                        type: 'body',
                        parameters: [
                        ],
                    },
                    {
                        type: 'button',
                        sub_type: 'url',
                        index: 0,
                        parameters: [
                            {
                                type: 'text',
                                text: auth,
                            },
                        ],
                    },
                ],
            },
        },
        users[uid].phone,
        gnids.wanumber,
    )
    console.log("SilentAuth Template: ", mtmpl.custom.template.components)
    wvonage.messages.send(mtmpl)
        .then(resp => console.log(resp.message_uuid))
        .catch(err => {
            console.error(err)
            console.log("SilentAuth Bad parameters: ", err.response.data.invalid_parameters)
        });
}
async function doWA(uid) {
    let mtmpl = new CustomMessage(
        {
            type: "template",
            template: {
                namespace: `${WHATSAPP_TEMPLATE_NAMESPACE}`,
                name: `${WHATSAPP_TEMPLATE_NAME}`,
                language: {
                    policy: 'deterministic',
                    code: 'en',
                },
                components: [
                    {
                        type: 'header',
                        parameters: [
                            {
                                type: "image",
                                image: {
                                    link: "https://vids.vonage.com/vonage_white_on_black.png"
                                }
                            }
                        ],
                    },
                    {
                        type: 'body',
                        parameters: [
                            {
                                type: "text",
                                text: users[uid].brand,
                            }
                        ],
                    },
                    {
                        type: 'button',
                        sub_type: 'quick_reply',
                        index: 0,
                        parameters: [
                            {
                                type: 'payload',
                                payload: 'yes',
                            },
                        ],
                    },
                    {
                        type: 'button',
                        sub_type: 'quick_reply',
                        index: 1,
                        parameters: [
                            {
                                type: 'payload',
                                payload: 'no',
                            },
                        ],
                    },
                ],
            },

        },
        users[uid].phone,
        gnids.wanumber,
    )
    console.log("Template: ", mtmpl)
    wvonage.messages.send(mtmpl)
        .then(resp => console.log(resp.message_uuid))
        .catch(err => {
            console.error(err)
            console.log("Bad parameters: ", err.response.data.invalid_parameters)
        });

}

app.post("/button", async (req, res) => {
    var id = getId(req);
    if ((id < 0) || !users[id]) {
        return res.status(401).end();
    }
    let resp = {};
    var date = new Date().toLocaleString();
    console.log("Button/Conversation request at " + date + " for " + id);
    console.log(req.body);
    let phone = req.body.phone;
    users[id].action = 'button';
    users[id].phone = phone;
    users[id].brand = req.body.brand;
    users[id].button = {
        initial: req.body.initial,
        success: req.body.success,
        reject: req.body.reject,
        timeout: ((Math.floor(new Date().getTime() / 1000)) + parseInt(req.body.timeout)),
    }
    utils.registerWA(phone, server_url + '/wa_inbound?uid=' + id, 'incoming');
    utils.registerWA(phone, server_url + '/wa_status?uid=' + id, 'event');
    doWA(id);
    console.log("Sending WA Template to: " + phone, users[id].button);
    let vid = null;
    res.status(200).json({ id: vid });
})
app.post("/qr", async (req, res) => {
    var id = getId(req);
    if ((id < 0) || !users[id]) {
        return res.status(401).end();
    }
    let resp = {};
    var date = new Date().toLocaleString();
    console.log("QR request at " + date + " for " + id);
    console.log(req.body);
    let phone = req.body.phone;
    users[id].action = 'qr';
    users[id].phone = phone;
    users[id].qr = {
        pin: req.body.pin,
        timeout: ((Math.floor(new Date().getTime() / 1000)) + parseInt(req.body.timeout)),
    }
    utils.registerWA(phone, server_url + '/wa_inbound?uid=' + id, 'incoming');
    utils.registerWA(phone, server_url + '/wa_status?uid=' + id, 'event');
    let vid = null;
    res.status(200).json({ id: vid });
})

if (!startup()) {
    console.log("Startup error... quitting.");
    process.exit(1);
}
//const port = gnids.port || 8077;
const port = process.env.VCR_PORT;

var date = new Date().toLocaleString();
console.log("Starting up at " + date);
app.listen(port, 'localhost', () => console.log(`Server application listening on port ${port}!`));
