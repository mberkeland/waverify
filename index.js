import { Vonage } from "@vonage/server-sdk";
import { vcr } from "@vonage/vcr-sdk";
import express from 'express';

const app = express();
const port = process.env.VCR_PORT;
import vutils from './vutils.js';
const vonage = new Vonage(
    {
        applicationId: process.env.API_APPLICATION_ID,
        privateKey: process.env.PRIVATE_KEY
    }
);

var server_url = process.env.VCR_INSTANCE_PUBLIC_URL;
const pchannel = "waverify";
app.use(express.json());
app.use(express.static('public'));

app.get('/_/health', async (req, res) => {
    res.sendStatus(200);
});
console.log("VCR Environment variables: ", process.env.VCR_INSTANCE_PUBLIC_URL, process.env.baseurl);


var gnids;
gnids = vutils.getIniStuff().then((res) => {
    gnids = res;
    console.log("Got ini: ", gnids.nserver)
}).catch((err) => {
    console.log("Internal Error reading ini: ", err);
})

app.listen(port, () => {
    console.log(`App listening on port ${port}`)
});