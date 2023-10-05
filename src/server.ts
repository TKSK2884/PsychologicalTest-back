import express from "express";

import cors from "cors";
import fs from "fs";

import https from "https";

import init from "./service/db";
import mindMiddleware from "./service/middleware";

import { startTestHandler, loadTestListHandler } from "./service/test";
import { testProgressUpdateHandler } from "./service/test";
import {
    createTestResultHandler,
    loadTestResultHandler,
    saveTestResultHandler,
} from "./service/testResult";
import { kakaoTokenHandler } from "./service/member";
import { loginHandler, joinHandler, memberInfoHandler } from "./service/member";

const app = express();
const port = 8443;

app.use(cors());
app.use(express.json());
app.use(mindMiddleware);

init();

app.post("/kakao/token", kakaoTokenHandler);

app.post("/memeber/login", loginHandler);

app.post("/memeber/join", joinHandler);

app.get("/member/info", memberInfoHandler);

app.get("/test", startTestHandler);

app.get("/test/list", loadTestListHandler);

app.post("/test/update", testProgressUpdateHandler);

app.post("/test/result", createTestResultHandler);

app.get("/test/result/history", loadTestResultHandler);

app.post("/test/result/save", saveTestResultHandler);

if (process.env.PRODUCTION == "1") {
    const options = {
        key: fs.readFileSync("./keys/pk.pem"),
        cert: fs.readFileSync("./keys/fc.pem"),
    };

    let server = https.createServer(options, app);

    server.listen(port, () => {
        console.log(`Example app listening on port ${port}`);
    });
} else {
    app.listen(port, () => {
        console.log(`Example app listening on port ${port}`);
    });
}
