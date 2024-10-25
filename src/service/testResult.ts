import mysql from "mysql2/promise";
import { connectPool } from "./db";
import {
    ERROR_MISSING_VALUE,
    ERROR_RESULT_INVALID,
    ERORR_BAD_REQUEST,
} from "../utils/errorMessage";
import { generatePrompt } from "./generatePrompt";
import { ResultObject, TestListObject } from "../../structure/type";
import { callOpenAIApi } from "../api/openAI";

export async function generateTestResultHandler(req, res) {
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

    // let testFile = JSON.parse(selectTestResult[0].test_content);

    let testFile = selectTestResult[0].test_content;

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

    let prompt: string = generatePrompt(paramsScore);
    let systemMessage: string = selectTestResult[0].system_message;

    let testResult: string = (await callOpenAIApi(prompt, systemMessage)) ?? "";

    if (testResult == "" || null) {
        return res.status(500).json({
            errorCode: ERORR_BAD_REQUEST,
            error: "An error occurred during your request.",
        });
    }

    await connectPool.query(
        "INSERT INTO `test_result` (`token`, `content`, `select_test`)" +
            " VALUES (?, ?, ?)",
        [progressToken, testResult, selectTest]
    );

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
    }

    return res.status(200).json({
        result: testResult,
        success: true,
    });
}
export async function loadTestResultHandler(req, res) {
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

    let [testListResult] = (await connectPool.query(
        "SELECT `test_name` FROM `test_list`"
    )) as mysql.RowDataPacket[];

    if (testListResult.length === 0) {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing testListResult value",
        });
    }

    let testNames: string[] = testListResult.map(
        (testItem: TestListObject): string => {
            return testItem.test_name;
        }
    );

    const convertTestindex = (id: number): number => {
        if (id - 1 < 0) {
            return 0;
        }

        return id - 1;
    };

    let contentArray: ResultObject[] = result.map((item: ResultObject) => ({
        select_test: item.select_test,
        select_test_name: testNames[convertTestindex(item.select_test)] ?? "",
        content: item.content,
        time_date: item.time_date,
    }));

    return res.status(200).json({
        result: contentArray,
        success: true,
    });
}

export async function saveTestResultHandler(req, res) {
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
        [saveResultID, memberID]
    );

    console.log("result is saved");

    return res.status(200).json({
        success: true,
    });
}
