import { Configuration, OpenAIApi } from "openai";
import crypto from "crypto";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { connectPool } from "./db";
import {
    ERROR_API_KEY_INVALID,
    ERROR_MISSING_VALUE,
    ERROR_RESULT_INVALID,
    ERORR_BAD_REQUEST,
} from "../utill/error-message";
import { generatePrompt } from "./generatePrompt";
import { Data, ResultObject, indexingString } from "../../structure/type";

dotenv.config();

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

export async function testHandler(req, res) {
    let progressToken: string = req.query.progressToken ?? "";
    let selectTest: string = req.query.selectTest ?? "";

    if (selectTest == "") {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing value",
        });
    }

    let [result] = (await connectPool.query(
        "SELECT * FROM `test_list` WHERE `id` = ?",
        [selectTest]
    )) as mysql.RowDataPacket[];

    let testFile = JSON.parse(result[0].test_content);

    if (Object.keys(testFile).length == 0) {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing test file",
        });
    }

    let selectedTestName: string = result[0].test_name;

    if (selectedTestName == "") {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing value",
        });
    }

    if (progressToken != "" && selectTest != "") {
        let [result] = (await connectPool.query(
            "SELECT `progress` FROM `test_progress` WHERE `token` = ? AND `select_test` = ?",
            [progressToken, selectTest]
        )) as mysql.RowDataPacket[];

        if (result.length == 0) {
            await connectPool.query(
                "INSERT INTO `test_progress` (`token`, `select_test`) VALUES (?,?)",
                [progressToken, selectTest]
            );

            let [result] = (await connectPool.query(
                "SELECT LAST_INSERT_ID() AS `id`"
            )) as mysql.RowDataPacket[];

            let progressID: string = result[0].id;

            return res.status(200).json({
                progressID: progressID,
                token: progressToken,
                test: testFile,
                test_name: selectedTestName,
                success: true,
            });
        }

        if (result.length != 0) {
            let progress: string = result[0].progress ?? "";

            return res.status(200).json({
                success: true,
                test: testFile,
                test_name: selectedTestName,
                progress: progress ?? "",
            });
        }
    }

    let randomizedToken: string =
        Math.random().toString() + new Date().getDate().toString();
    randomizedToken = crypto
        .createHash("sha256")
        .update(randomizedToken)
        .digest("hex");

    await connectPool.query(
        "INSERT INTO `test_progress` (`token`, `select_test`) VALUES (?,?)",
        [randomizedToken, selectTest]
    );

    return res.status(200).json({
        token: randomizedToken, // 진행도 토큰
        test: testFile,
        test_name: selectedTestName,
        success: true,
    });
}

export async function testListHandler(req, res) {
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

export async function testUpdateHandler(req, res) {
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

export async function testResultHandler(req, res) {
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

export async function testResultHistoryHandler(req, res) {
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

export async function testResultSaveHandler(req, res) {
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
