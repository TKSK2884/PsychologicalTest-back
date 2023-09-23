import { Configuration, OpenAIApi } from "openai";
import express from "express";
import axios from "axios";
import cors from "cors";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";
import qs from "qs";
import crypto from "crypto";
import { Data, ResultObject, indexingString } from "../structure/type";
import https from "https";

import { connectPool, init } from "./routes/db";
import { testHandler } from "./routes/test";

import {
    ERROR_USER_INVALID,
    ERROR_MISSING_VALUE,
    ERROR_RESULT_INVALID,
    ERROR_DUPLICATE_DATA,
    ERROR_NOT_MATCHED,
    ERROR_DB_INVALID,
    ERORR_BAD_REQUEST,
    ERROR_API_KEY_INVALID,
} from "./routes/error-message";

const app = express();
const port = 8443;

const mySalt: string | undefined = process.env.SALT;

dotenv.config();

app.use(cors());
app.use(express.json());
app.use(mindMiddleware);

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

// const ERROR_USER_INVALID: number = 101; //유저정보가 없음
// const ERROR_MISSING_VALUE: number = 102; //필수값이 없음

// const ERROR_RESULT_INVALID: number = 201; //결과요소가 없음
// const ERROR_DUPLICATE_DATA: number = 202; //중복된 데이터
// const ERROR_NOT_MATCHED: number = 203; //결과요소와 겹치지 않음

// const ERROR_DB_INVALID: number = 301; //DB연결실패
// const ERORR_BAD_REQUEST: number = 302; //잘못된 요청
// const ERROR_API_KEY_INVALID: number = 303; //API키가 없음
init();

async function mindMiddleware(req, res, next) {
    if (connectPool == null) {
        return res.status(500).json({
            errorCode: ERROR_DB_INVALID,
            error: "DB connection failed",
        });
    }

    let accessToken: string =
        (req.query.accessToken as string) ?? req.body.accessToken ?? "";

    if (accessToken != "") {
        let result = await getUserInfo(accessToken);

        if (result == null) {
            return res.status(401).json({
                errorCode: ERROR_DB_INVALID,
                error: "Access Token is wrong",
            });
        }

        res.locals.account = result;
    }

    next();
}

async function getUserInfo(
    accessToken: string
): Promise<{ nickname: string; id: string } | null> {
    if (accessToken == "") {
        return null;
    }

    let [result] = (await connectPool.query(
        "SELECT a.`nickname`,a.`id` FROM `access_token` AS `at`" +
            " LEFT JOIN `account` AS `a` ON `at`.`account_id` = `a`.id" +
            " WHERE `at`.`token` = ?",
        [accessToken]
    )) as mysql.RowDataPacket[];

    if (result.length == 0) {
        return null;
    }

    let userInfo: { nickname: string; id: string } = {
        nickname: result[0].nickname ?? "",
        id: result[0].id ?? "",
    };
    return userInfo;
}

app.post("/kakao/token", kakaoTokenHandler);
async function kakaoTokenHandler(req, res) {
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

    let [result] = (await connectPool.query(
        "SELECT * FROM `linked_user` WHERE `access_token` = ? " +
            "AND `user_nickname` = ? AND `linked_service` = ?",
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
            token: token,
            success: true,
        });
    }

    await connectPool.query(
        "INSERT INTO `linked_user`" +
            " (`access_token`, `user_nickname`, `linked_service`)" +
            " VALUES (?,?,?)",
        [fetchedID, fetchedNickname, linkService]
    );

    let socialLinkedID: string = await searchLinkedId(fetchedID);

    if (socialLinkedID == "") {
        return res.status(400).json({
            errorCode: ERORR_BAD_REQUEST,
            error: "Bad request",
        });
    }

    await connectPool.query(
        "INSERT INTO `account` " +
            "(`social_linked_id`, `nickname` , `user_type`)" +
            " VALUES (?,?,?)",
        [socialLinkedID, fetchedNickname, userType]
    );

    let id: string = await searchAccountId(fetchedID);

    return res.status(200).json({
        token: await createToken(id),
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

    await connectPool.query(
        "INSERT INTO `access_token` (`account_id`, `token`) VALUES (?,?)",
        [accountID, randomizedToken]
    );

    return randomizedToken;
}

async function searchAccountId(userId: string): Promise<string> {
    let value: string = await searchLinkedId(userId);

    let [result] = (await connectPool.query(
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
    let [result] = (await connectPool.query(
        "SELECT * FROM `linked_user` WHERE `access_token` = ?",
        [userId]
    )) as mysql.RowDataPacket[];

    if (result.length == 0) {
        return "";
    }
    let id: string = result[0].id ?? "";
    return id;
}

app.post("/memeber/login", loginHandler);
async function loginHandler(req: Request, res: any) {
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

    let [result] = (await connectPool.query(
        "SELECT `id` FROM `account` WHERE `user_id`=? AND `user_pw`=?",
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
        token: await createToken(id),
        success: true,
    });
}

app.post("/memeber/join", joinHandler);
async function joinHandler(req: Request, res: any): Promise<any> {
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

    let [result] = (await connectPool.query(
        "SELECT * FROM `account` WHERE `user_id`=? OR `nickname`=?",
        [fetchedID, fetchedNickname]
    )) as mysql.RowDataPacket[];

    if (result.length != 0) {
        let resultUserID: string = result[0].user_id ?? "";
        let resultNickname: string = result[0].nickname ?? "";

        if (resultUserID == fetchedID || resultNickname == fetchedNickname)
            return res.status(400).json({
                errorCode: ERROR_DUPLICATE_DATA,
                error: "ID or nickname already exists",
            });

        return res.status(500).json({
            errorCode: ERORR_BAD_REQUEST,
            error: "Bad Request",
        });
    }

    fetchedPW = crypto
        .createHash("sha256")
        .update(fetchedPW + mySalt)
        .digest("hex");

    await connectPool.query(
        "INSERT INTO `account` (`user_id`, `user_pw`, `nickname`) VALUES (?,?,?)",
        [fetchedID, fetchedPW, fetchedNickname]
    );

    return res.status(200).json({
        success: true,
    });
}

app.get("/member/info", memberInfoHandler);
async function memberInfoHandler(req, res) {
    let nickname: string = res.locals.account?.nickname ?? "";

    return res.status(200).json({
        nickname: nickname,
        success: true,
    });
}

app.get("/test", testHandler);
// async function testHandler(req, res) {
//     let progressToken: string = req.query.progressToken ?? "";
//     let selectTest: string = req.query.selectTest ?? "";

//     console.log(progressToken, selectTest);

//     if (selectTest == "") {
//         return res.status(400).json({
//             errorCode: ERROR_MISSING_VALUE,
//             error: "Missing value",
//         });
//     }

//     let [result] = (await connectPool.query(
//         "SELECT * FROM `test_list` WHERE `id` = ?",
//         [selectTest]
//     )) as mysql.RowDataPacket[];

//     let testFile = JSON.parse(result[0].test_content);

//     if (Object.keys(testFile).length == 0) {
//         return res.status(400).json({
//             errorCode: ERROR_MISSING_VALUE,
//             error: "Missing test file",
//         });
//     }

//     let selectedTestName: string = result[0].test_name;

//     if (selectedTestName == "") {
//         return res.status(400).json({
//             errorCode: ERROR_MISSING_VALUE,
//             error: "Missing value",
//         });
//     }

//     if (progressToken != "" && selectTest != "") {
//         let [result] = (await connectPool.query(
//             "SELECT `progress` FROM `test_progress` WHERE `token` = ? AND `select_test` = ?",
//             [progressToken, selectTest]
//         )) as mysql.RowDataPacket[];

//         if (result.length == 0) {
//             await connectPool.query(
//                 "INSERT INTO `test_progress` (`token`, `select_test`) VALUES (?,?)",
//                 [progressToken, selectTest]
//             );

//             let [result] = (await connectPool.query(
//                 "SELECT LAST_INSERT_ID() AS `id`"
//             )) as mysql.RowDataPacket[];

//             let progressID: string = result[0].id;

//             return res.status(200).json({
//                 progressID: progressID,
//                 token: progressToken,
//                 test: testFile,
//                 test_name: selectedTestName,
//                 success: true,
//             });
//         }

//         if (result.length != 0) {
//             let progress: string = result[0].progress ?? "";

//             return res.status(200).json({
//                 success: true,
//                 test: testFile,
//                 test_name: selectedTestName,
//                 progress: progress ?? "",
//             });
//         }
//     }

//     let randomizedToken: string =
//         Math.random().toString() + new Date().getDate().toString();
//     randomizedToken = crypto
//         .createHash("sha256")
//         .update(randomizedToken)
//         .digest("hex");

//     await connectPool.query(
//         "INSERT INTO `test_progress` (`token`, `select_test`) VALUES (?,?)",
//         [randomizedToken, selectTest]
//     );

//     return res.status(200).json({
//         token: randomizedToken, // 진행도 토큰
//         test: testFile,
//         test_name: selectedTestName,
//         success: true,
//     });
// }

app.get("/test/list", testListHandler);
async function testListHandler(req, res) {
    let loadTestList: string = req.query.loadTestList ?? "";

    if (loadTestList == "") {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing value",
        });
    }

    let [result] = (await connectPool.query(
        "SELECT `id`,`test_name` FROM `test_list`"
    )) as mysql.RowDataPacket[];

    if (result.length == 0) {
        return res.status(500).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing value",
        });
    }

    let testListArray: indexingString[] = result.map(
        (item: indexingString) => ({
            id: item.id,
            test_name: item.test_name,
        })
    );

    return res.status(200).json({
        testList: testListArray,
        success: true,
    });
}

app.post("/test/update", testUpdateHandler);
async function testUpdateHandler(req, res) {
    let progressToken: string = req.body.token ?? "";
    let updatedProgress: number = req.body.progress;
    let selectTest: string = req.body.selectTest;

    if (
        progressToken == "" ||
        updatedProgress == null ||
        updatedProgress == undefined
    ) {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "params missing",
        });
    }

    let [result] = (await connectPool.query(
        "SELECT `progress` FROM `test_progress` WHERE `token` = ? AND `select_test` = ?",
        [progressToken, selectTest]
    )) as mysql.RowDataPacket[];

    if (result[0].progress == null) {
        await connectPool.query(
            "UPDATE `test_progress` SET `progress`" +
                " = COALESCE(`progress`, 0) + ? WHERE `token` = ? AND `select_test` = ?",
            [updatedProgress, progressToken, selectTest]
        );
        return res.status(200).json({ success: true });
    }

    await connectPool.query(
        "UPDATE `test_progress` SET " +
            "`progress` = CONCAT(`progress`, ?) WHERE `token` = ? AND `select_test` = ?",
        [updatedProgress, progressToken, selectTest]
    );

    return res.status(200).json({ success: true });
}

app.post("/test/result", testResultHandler);
async function testResultHandler(req, res) {
    let progressToken: string = req.body.progressToken ?? "";
    let selectTest: string = req.body.selectTest ?? "";

    if (progressToken == "" || selectTest == "") {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing progressToken or selectTest",
        });
    }

    let [result] = (await connectPool.query(
        "SELECT * FROM `test_progress` WHERE `token` = ? AND `select_test` = ? AND `status` = 0",
        [progressToken, selectTest]
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

    await connectPool.query(
        "UPDATE `test_progress` SET `status` = ? WHERE `token` = ? AND `select_test` = ?",
        [finished, progressToken, selectTest]
    );

    let progress: string = result[0].progress ?? "";
    // let selectTest: string = result[0].select_test ?? "";
    let timeDate: string = result[0].time_date ?? "";

    if (progress == "" || timeDate == "") {
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

    await connectPool.query(
        "DELETE FROM `test_progress` WHERE `time_date` < ? AND `status` = 0",
        [oneMonthAgoTimeDate]
    );

    let [selectTestResult] = (await connectPool.query(
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
        let select: number = convertedProcessArray[i] ?? 0;

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

    let prompt: string = generatePrompt(paramsScore);
    let systemMessage: string = selectTestResult[0].system_message;

    try {
        const completion = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `${systemMessage}`,
                },
                {
                    role: "user",
                    content: `${prompt}`,
                },
            ],

            temperature: 0.9,
            max_tokens: 1000,
        });

        // console.log(completion.data.choices);

        let testResult: string =
            completion.data.choices[0].message?.content ?? "";

        await connectPool.query(
            "INSERT INTO `test_result` (`token`, `content`, `select_test`)" +
                " VALUES (?, ?, ?)",
            [progressToken, testResult, selectTest]
        );

        res.status(200).json({
            result: testResult,
            success: true,
        });

        let memberID: string = res.locals.account?.id ?? "";

        if (memberID !== "") {
            let [result] = (await connectPool.query(
                "SELECT `id` FROM `test_result` WHERE `token` = ?",
                [progressToken]
            )) as mysql.RowDataPacket[];

            if (result.length == 0) {
                return res.status(500).json({
                    errorCode: ERROR_MISSING_VALUE,
                    error: "Missing result value",
                });
            }

            let resultID: string = result[0].id ?? "";

            if (resultID == "") {
                return res.status(500).json({
                    errorCode: ERROR_MISSING_VALUE,
                    error: "Missing resultID value",
                });
            }

            await connectPool.query(
                "INSERT INTO `test_saved_result` (`result_id`, `member_id`)" +
                    " VALUES (?,?)",
                [resultID, memberID]
            );

            return;
        }

        return;
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
    let memberID: string = res.locals.account?.id ?? "";

    let [result] = (await connectPool.query(
        "SELECT `select_test`,`time_date`,`content`" +
            " FROM `test_saved_result` AS `tsr`" +
            " LEFT JOIN `test_result` AS `tr` ON `tsr`.`result_id` = `tr`.`id`" +
            " WHERE `tsr`.`member_id` = ?" +
            " ORDER BY `time_date` DESC LIMIT 5",
        [memberID]
    )) as mysql.RowDataPacket[];

    if (result.length === 0) {
        return res.status(200).json({
            result: [],
            success: true,
        });
    }

    let selectTest: string = result[0].select_test ?? "";

    if (selectTest === "") {
        return res.status(500).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing selectTest value",
        });
    }

    let [testListResult] = (await connectPool.query(
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

    let contentArray: ResultObject[] = result.map((item: ResultObject) => ({
        select_test_id: selectTest,
        select_test: testName,
        content: item.content,
        time_date: item.time_date,
    }));

    return res.status(200).json({
        result: contentArray,
        success: true,
    });
}

app.post("/test/result/save", testResultSaveHandler);
async function testResultSaveHandler(req, res) {
    let saveResultToken: string = req.body.saveResultToken ?? "";

    if (saveResultToken == "") {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing saveResultToken",
        });
    }

    let memberID: string = res.locals.account?.id ?? "";

    if (memberID == "") {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing memberID",
        });
    }

    let [result] = (await connectPool.query(
        "SELECT `id` FROM `test_result` WHERE `token` = ? LIMIT 1",
        [saveResultToken]
    )) as mysql.RowDataPacket[];

    let saveResultID: string = result[0].id ?? "";

    if (saveResultID == "") {
        return res.status(500).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing saveResultID",
        });
    }

    await connectPool.query(
        "INSERT INTO `test_saved_result` (`result_id`, `member_id`) VALUES (?, ?)",
        [saveResultToken, memberID]
    );

    console.log("result is saved");

    return res.status(200).json({
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
