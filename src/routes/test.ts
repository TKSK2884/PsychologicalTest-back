import { connectPool } from "./db";
import crypto from "crypto";
import mysql from "mysql2/promise";
import { ERROR_MISSING_VALUE } from "./error-message";

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
