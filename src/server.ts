import { Configuration, OpenAIApi } from "openai";
import express from "express";
import axios from "axios";
import cors from "cors";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";
import qs from "qs";
import crypto from "crypto";
import { Data, ResultObject } from "../structure/type";
import lodash from "lodash";
import test from "node:test";
import { promises } from "dns";

const app = express();
const port = 3000;

let connection: mysql.Connection;

const mySalt: string | undefined = process.env.SALT;

dotenv.config();

app.use(cors());
app.use(express.json());

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);
const ERROR_USER_INVALID: number = 101;
const ERROR_MISSING_VALUE: number = 102;

const ERROR_RESULT_INVALID: number = 201;
const ERROR_DUPLICATE_DATA: number = 202;

const ERROR_DB_INVALID: number = 301;
const ERORR_BAD_REQUEST: number = 302;
const ERROR_API_KEY_INVALID: number = 303;

async function init() {
    connection = await mysql.createConnection({
        host: process.env.DB_SERVER_ADDR,
        user: process.env.DB_User,
        password: process.env.DB_PASSWORD,
        database: process.env.DB,
    });

    console.log("DB Connection successful?:", connection != null);
}

init();

app.post("/kakao/token", kakaoTokenHandler);
async function kakaoTokenHandler(req, res) {
    if (connection == null) {
        return res.status(500).json({
            errorCode: ERROR_DB_INVALID,
            error: "DB connection failed",
        });
    }

    let code: string = req.body.code;

    if ((code ?? "") == "") {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing value",
        });
    }

    console.log(code);

    const tokenUrl: string = "https://kauth.kakao.com/oauth/token";

    const data: Data = {
        grant_type: "authorization_code",
        client_id: process.env.KAKAO_ACCESS_KEY,
        redirect_uri: process.env.KAKAO_REDIRECT_URI,
        code: code,
    };

    let accessToken: string = "";
    let fetchedID: string = "";
    let fetchedNickname: string = "";
    let linkService: string = "kakao";
    let userType: number = 1;

    try {
        let kakaoResponse = await axios.post(tokenUrl, qs.stringify(data), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });
        console.log(kakaoResponse.data);
        accessToken = kakaoResponse.data.access_token;

        const userInfoUrl: string = "https://kapi.kakao.com/v2/user/me";

        let kakaoUserInfo = await axios.get(userInfoUrl, {
            headers: {
                Authorization: "Bearer " + accessToken,
            },
        });

        console.log(kakaoUserInfo.data);

        fetchedNickname = kakaoUserInfo.data.properties.nickname;
        fetchedID = kakaoUserInfo.data.id;
    } catch (error) {
        console.log(error.response.data);
        return res.status(400).json({
            errorCode: ERORR_BAD_REQUEST,
            error: "Bad request",
        });
    }

    if ((fetchedID ?? "") == "" || (fetchedNickname ?? "") == "") {
        return res.status(400).json({
            errorCode: ERORR_BAD_REQUEST,
            error: "Bad request",
        });
    }

    let [result] = (await connection.query(
        "SELECT * FROM `linked_user` WHERE `access_token` = ? AND `user_nickname` = ? AND `linked_service` = ?",
        [fetchedID, fetchedNickname, linkService]
    )) as mysql.RowDataPacket[];

    if (result.length != 0) {
        console.log(result[0]);

        let id: string = await searchAccountId(fetchedID);
        let token: string = await createToken(id);

        if (id == "" || token == "") {
            return res.status(400).json({
                errorCode: ERORR_BAD_REQUEST,
                error: "Bad request",
            });
        }

        return res.status(200).json({
            id: id,
            token: token,
            success: true,
        });
    }

    await connection.query(
        "INSERT INTO `linked_user` (`access_token`, `user_nickname`, `linked_service`) VALUES (?,?,?)",
        [fetchedID, fetchedNickname, linkService]
    );

    let socialLinkedID: string = await searchLinkedId(fetchedID);

    if (socialLinkedID == "") {
        return res.status(400).json({
            errorCode: ERORR_BAD_REQUEST,
            error: "Bad request",
        });
    }

    await connection.query(
        "INSERT INTO `account` (`social_linked_id`, `nickname` , `user_type`) VALUES (?,?,?)",
        [socialLinkedID, fetchedNickname, userType]
    );

    let id: string = await searchAccountId(fetchedID);

    return res.status(200).json({
        id: id,
        success: true,
    });
}

async function createToken(fetchedID: string): Promise<string> {
    let randomizedToken: string =
        fetchedID + Math.random().toString() + new Date().getDate().toString();
    randomizedToken = crypto
        .createHash("sha256")
        .update(randomizedToken)
        .digest("hex");

    let accountID: string = fetchedID;

    if (accountID == "") {
        return "";
    }

    await connection.query(
        "INSERT INTO `token` (`account_id`, `token`) VALUES (?,?)",
        [accountID, randomizedToken]
    );

    return randomizedToken;
}

async function searchAccountId(userId: string): Promise<string> {
    let value: string = await searchLinkedId(userId);

    let [result] = (await connection.query(
        "SELECT * FROM `account` WHERE `social_linked_id` = ?",
        [value]
    )) as mysql.RowDataPacket[];

    if (result.length == 0) {
        return "";
    }
    let id: string = result[0].id;
    return id;
}

async function searchLinkedId(userId: string): Promise<string> {
    let [result] = (await connection.query(
        "SELECT * FROM `linked_user` WHERE `access_token` = ?",
        [userId]
    )) as mysql.RowDataPacket[];

    if (result.length == 0) {
        return "";
    }
    let id: string = result[0].id;
    return id;
}

app.post("/memeber/login", loginHandler);
async function loginHandler(req: Request, res: any) {
    if (connection == null) {
        return res.status(500).json({
            errorCode: ERROR_DB_INVALID,
            error: "DB connection failed",
        });
    }

    let fetchedBody: any = req.body;

    let fetchedID: string = fetchedBody?.id ?? "";
    let fetchedPW: string = fetchedBody?.pw ?? "";

    if (fetchedID == "" || fetchedPW == "") {
        return res.status(400).json({
            errorCode: ERROR_USER_INVALID,
            error: "ID or password is missing",
        });
    }

    fetchedPW = crypto
        .createHash("sha256")
        .update(fetchedPW + mySalt)
        .digest("hex");

    let [result] = (await connection.query(
        "SELECT * FROM `account` WHERE `user_id`=? AND `user_pw`=?",
        [fetchedID, fetchedPW]
    )) as mysql.RowDataPacket[];

    if (result.length == 0) {
        return res.status(400).json({
            errorCode: ERROR_USER_INVALID,
            error: "ID or password is missing",
        });
    }

    let id: string = result[0].id;

    return res.status(200).json({
        id: id,
        token: await createToken(id),
        success: true,
    });
}

app.post("/memeber/join", joinHandler);
async function joinHandler(req: Request, res: any): Promise<any> {
    if (connection == null) {
        return res.status(500).json({
            errorCode: ERROR_DB_INVALID,
            error: "DB connection failed",
        });
    }

    let fetchedBody: any = req.body;

    let fetchedID: string = fetchedBody?.id ?? "";
    let fetchedPW: string = fetchedBody?.pw ?? "";
    let fetchedNickname: string = fetchedBody?.name ?? "";

    if (fetchedID === "" || fetchedPW === "" || fetchedNickname === "") {
        return res.status(400).json({
            errorCode: ERROR_USER_INVALID,
            error: "params missing",
        });
    }

    let [result] = (await connection.query(
        "SELECT * FROM `account` WHERE `user_id`=? OR `nickname`=?",
        [fetchedID, fetchedNickname]
    )) as mysql.RowDataPacket[];

    if (result.length != 0) {
        let resultData = result[0];

        if (
            resultData.user_id == fetchedID ||
            resultData.nickname == fetchedNickname
        )
            return res.status(400).json({
                errorCode: ERROR_DUPLICATE_DATA,
                error: "ID or nickname already exists",
            });

        return res.status(400).json({
            errorCode: ERORR_BAD_REQUEST,
            error: "Bad Request",
        });
    }

    fetchedPW = crypto
        .createHash("sha256")
        .update(fetchedPW + mySalt)
        .digest("hex");

    await connection.query(
        "INSERT INTO `account` (`user_id`, `user_pw`, `nickname`) VALUES (?,?,?)",
        [fetchedID, fetchedPW, fetchedNickname]
    );

    return res.status(200).json({
        success: true,
    });
}

app.get("/test", testHandler);
async function testHandler(req, res) {
    if (connection == null) {
        return res.status(500).json({
            errorCode: ERROR_DB_INVALID,
            error: "DB connection failed",
        });
    }

    let progressToken: string = req.query.progressToken ?? "";
    let selectTest: string = req.query.selectTest ?? "";

    if (selectTest == "") {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing value",
        });
    }

    let [result] = (await connection.query(
        "SELECT * FROM `test_list` WHERE `id` = ?",
        [selectTest]
    )) as mysql.RowDataPacket[];

    let testFile = JSON.parse(result[0].test_content);

    if (progressToken != "") {
        let [result] = (await connection.query(
            "SELECT `progress` FROM `test_progress` WHERE `token` = ?",
            [progressToken]
        )) as mysql.RowDataPacket[];

        if (result.length == 0)
            return res.status(400).json({
                errorCode: ERROR_RESULT_INVALID,
                error: "Invalid token",
            });

        let progress: string = result[0].progress ?? "";

        let selectedTest: string = result[0].select_test ?? "";

        if (selectedTest != selectTest) {
            return res.status(400).json({
                errorCode: ERROR_RESULT_INVALID,
                error: "Invalid token",
            });
        }

        return res.status(200).json({
            success: true,
            test: testFile,
            progress: progress == "" ? 0 : progress,
        });
    }

    let randomizedToken: string =
        Math.random().toString() + new Date().getDate().toString();
    randomizedToken = crypto
        .createHash("sha256")
        .update(randomizedToken)
        .digest("hex");

    await connection.query(
        "INSERT INTO `test_progress` (`token`, `select_test`) VALUES (?,?)",
        [randomizedToken, selectTest]
    );

    return res.status(200).json({
        token: randomizedToken,
        test: testFile,
        success: true,
    });
}

app.post("/test/update", testUpdateHandler);
async function testUpdateHandler(req, res) {
    if (connection == null) {
        return res.status(500).json({
            errorCode: ERROR_DB_INVALID,
            error: "DB connection failed",
        });
    }
    let token: string = req.body.token ?? "";
    let updatedProgress: number = req.body.progress;

    if (
        token == "" ||
        updatedProgress == null ||
        updatedProgress == undefined
    ) {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "params missing",
        });
    }

    let [result] = (await connection.query(
        "SELECT `progress` FROM `test_progress` WHERE `token` = ?",
        [token]
    )) as mysql.RowDataPacket[];

    if (result[0].progress == null) {
        await connection.query(
            "UPDATE `test_progress` SET `progress` = COALESCE(`progress`, 0) + ? WHERE `token` = ?",
            [updatedProgress, token]
        );

        return res.status(200).json({ success: true });
    }

    await connection.query(
        "UPDATE `test_progress` SET `progress` = CONCAT(`progress`, ?) WHERE `token` = ?",
        [updatedProgress, token]
    );

    return res.status(200).json({ success: true });
}

app.post("/test/result", testResultHandler);
async function testResultHandler(req, res) {
    if (connection == null) {
        return res.status(500).json({
            errorCode: ERROR_DB_INVALID,
            error: "DB connection failed",
        });
    }

    let token: string = req.body.token ?? "";
    let userId: string = req.body.user_id ?? "";

    if (token == "") {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing token value",
        });
    }

    let [result] = (await connection.query(
        "SELECT * FROM `test_progress` WHERE `token` = ?",
        [token]
    )) as mysql.RowDataPacket[];

    console.log(result);

    if (result.length == 0) {
        return res.status(400).json({
            errorCode: ERROR_RESULT_INVALID,
            error: "Invalid token value",
        });
    }

    console.log(result[0].progress);

    let finished: number = 1;

    await connection.query(
        "UPDATE `test_progress` SET `status` = ? WHERE `token` = ?",
        [finished, token]
    );

    let progress: string = result[0].progress ?? "";
    let selectTest: string = result[0].select_test ?? "";
    let timeDate: string = result[0].time_date ?? "";

    if (progress == "" || selectTest == "" || timeDate == "") {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing progress value",
        });
    }

    let presentTimeDate: Date = new Date(timeDate);

    let oneMonthAgoTimeDate: Date = new Date(
        presentTimeDate.getFullYear(),
        presentTimeDate.getMonth() - 1,
        presentTimeDate.getDate()
    );

    await connection.query(
        "DELETE FROM `test_progress` WHERE `time_date` < ? AND `status` = 0",
        [oneMonthAgoTimeDate]
    );

    let [selectTestResult] = (await connection.query(
        "SELECT * FROM `test_list` WHERE `id` = ?",
        [selectTest]
    )) as mysql.RowDataPacket[];

    let testFile = JSON.parse(selectTestResult[0].test_content);

    if (Object.keys(testFile).length == 0) {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing test file",
        });
    }

    let params: any = testFile.settings.parameters;
    let paramsScore: { [k: string]: number } = {};

    Object.keys(params).forEach((k: string) => {
        let targetKey: string = params[k];
        paramsScore[targetKey] = 0;
    });

    let processArray: string[] = progress.split("");
    let convertedProcessArray: number[] = processArray.map((item) =>
        Number(item)
    );

    let arrayLength: number = testFile.questions.length;

    for (let i = 0; i < arrayLength; i++) {
        let select: number = convertedProcessArray[i];

        let selectParams = testFile.questions[i].selection[select].params;
        let paramsKey: string[] = Object.keys(selectParams);

        for (let j: number = 0; j < paramsKey.length; j++) {
            let key = paramsKey[j];
            let targetValue = selectParams[key];
            paramsScore[key] += targetValue;
        }
    }

    if (!configuration.apiKey) {
        console.log("API key is missing");
        return res.status(500).json({
            errorCode: ERROR_API_KEY_INVALID,
            error: "API key is missing",
        });
    }

    let content: string = generatePrompt(paramsScore);

    try {
        const completion = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `You will play the role of system and psychology advisor.
                    The data given from the user is a random classification of the propensity of psychological test results.
                        Look at the results and tell me the results of predicting the person's personality or behavior.
                        There are values that express propensity from 0 to 30, and the higher the value, the closer the propensity,
                        and avoid mentioning the numerical value and the higher the value, the closer the propensity.
                        Start with the word "you" and say it like you do to someone who's been tested. 
                        and You can predict your personality and behavior.Please don't include that".
                        Please translate this into Korean only`,
                },
                {
                    role: "user",
                    content: `${content}`,
                },
            ],

            temperature: 0.9,
            max_tokens: 1000,
        });

        // console.log(completion.data.choices);

        let testResult: string =
            completion.data.choices[0].message?.content ?? "";

        if (!isNaN(Number(userId)) && userId === "") {
            await connection.query(
                "INSERT INTO `test_result` (`user_id`, `content`, `select_test`) VALUES (?, ?, ?)",
                [userId, testResult, selectTest]
            );

            console.log(userId);
        }

        return res.status(200).json({
            result: testResult,
        });
    } catch (error) {
        // Consider adjusting the error handling logic for your use case
        if (error.response) {
            console.error(error.response.status, error.response.data);
            res.status(error.response.status).json(error.response.data);
        } else {
            console.error(`Error with OpenAI API request: ${error.message}`);
            res.status(500).json({
                errorCode: ERORR_BAD_REQUEST,
                error: "An error occurred during your request.",
            });
        }
    }

    return;
}

app.get("/test/result/history", testResultHistoryHandler);
async function testResultHistoryHandler(req, res) {
    if (connection == null) {
        return res.status(500).json({
            errorCode: ERROR_DB_INVALID,
            error: "DB connection failed",
        });
    }

    let userId: string = req.query.user_id ?? "";

    if (userId.trim() === "" || isNaN(Number(userId))) {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing userId value",
        });
    }

    let [result] = (await connection.query(
        "SELECT * FROM `test_result` WHERE `user_id` = ?",
        [userId]
    )) as mysql.RowDataPacket[];

    if (result.length === 0) {
        return res.status(200).json({
            result: [],
            success: true,
        });
    }

    let selectTest: number = result[0].select_test;

    let [testListResult] = (await connection.query(
        "SELECT `test_name` FROM `test_list` WHERE `id` = ?",
        [selectTest]
    )) as mysql.RowDataPacket[];

    if (testListResult.length === 0) {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing testListResult value",
        });
    }

    let testName: string = testListResult[0].test_name;

    let contentArray: ResultObject[] = result.map((item) => ({
        select_test: testName,
        content: item.content,
        time_date: item.time_date,
    }));

    return res.status(200).json({
        result: contentArray,
        success: true,
    });
}

function generatePrompt(value: object): string {
    let convertedObject: string = "";

    for (let key in value) {
        convertedObject += key + ":" + value[key] + ",";
    }
    convertedObject = convertedObject.slice(0, -1);
    console.log(convertedObject);

    return `My data is a ${convertedObject}`;
}

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
