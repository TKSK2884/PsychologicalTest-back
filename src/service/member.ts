import { Request } from "express";
import crypto from "crypto";
import mysql from "mysql2/promise";
import { connectPool } from "./db";
import {
    ERROR_DUPLICATE_DATA,
    ERROR_USER_INVALID,
    ERORR_BAD_REQUEST,
} from "../utill/error-message";
import { createToken } from "./userUtill";

const mySalt: string | undefined = process.env.SALT;

export async function loginHandler(req: Request, res: any) {
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

export async function joinHandler(req: Request, res: any): Promise<any> {
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

export async function memberInfoHandler(req, res) {
    let nickname: string = res.locals.account?.nickname ?? "";

    return res.status(200).json({
        nickname: nickname,
        success: true,
    });
}
