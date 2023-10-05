import crypto from "crypto";
import mysql from "mysql2/promise";

import { connectPool } from "./db";
import { ERROR_MISSING_VALUE } from "../utils/errorMessage";
import { indexingString } from "../../structure/type";

export async function startTestHandler(req, res) {
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

export async function loadTestListHandler(req, res) {
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

export async function testProgressUpdateHandler(req, res) {
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
