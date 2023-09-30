import { Request, Response } from "express";
import axios from "axios";
import qs from "qs";
import { connectPool } from "../service/db";
import { ERROR_MISSING_VALUE, ERORR_BAD_REQUEST } from "../utill/error-message";
import mysql from "mysql2/promise";

import {
    createToken,
    searchAccountID,
    searchLinkedID,
} from "../service/userUtill";
import { Data, ResultObject, indexingString } from "../../structure/type";

export async function kakaoTokenHandler(req, res) {
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

        let id: string = await searchAccountID(fetchedID);
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
        token: await createToken(id),
        success: true,
    });
}
