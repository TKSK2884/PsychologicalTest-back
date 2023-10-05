import { Request } from "express";
import crypto from "crypto";
import mysql from "mysql2/promise";
import { connectPool } from "./db";
import {
    ERROR_DUPLICATE_DATA,
    ERROR_USER_INVALID,
    ERORR_BAD_REQUEST,
    ERROR_MISSING_VALUE,
} from "../utils/errorMessage";
import { kakaoLogin } from "../api/kakao";
import { searchAccountID, searchLinkedID } from "./userService";
import { generateAccessToken } from "../utils/tokenUtil";

const mySalt: string | undefined = process.env.SALT;

export async function kakaoTokenHandler(req, res) {
    let code: string = req.body.code;

    if ((code ?? "") == "") {
        return res.status(400).json({
            errorCode: ERROR_MISSING_VALUE,
            error: "Missing value",
        });
    }

    const tokenUrl: string = "https://kauth.kakao.com/oauth/token";

    let accessToken: string = "";

    let linkService: string = "kakao";
    let userType: number = 1;

    let kakaoLoginInfo = await kakaoLogin(code, tokenUrl, accessToken); // return { fetchedID: fetchedID, fetchedNickname: fetchedNickname };

    if (kakaoLoginInfo == null) {
        return res.status(400).json({
            errorCode: ERORR_BAD_REQUEST,
            error: "Bad request",
        });
    }

    let fetchedID: string = "";
    let fetchedNickname: string = "";

    fetchedID = kakaoLoginInfo.id ?? "";
    fetchedNickname = kakaoLoginInfo.nickname ?? "";

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
        let id: string = await searchAccountID(fetchedID);
        let token: string = await generateAccessToken(id);

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

    let socialLinkedID: string = await searchLinkedID(fetchedID);

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

    let id: string = await searchAccountID(fetchedID);

    return res.status(200).json({
        token: await generateAccessToken(id),
        success: true,
    });
}

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
        token: await generateAccessToken(id),
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
