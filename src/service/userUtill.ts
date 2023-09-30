import crypto from "crypto";
import mysql from "mysql2/promise";
import { connectPool } from "./db";

export async function getUserInfo(
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

export async function createToken(fetchedID: string): Promise<string> {
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

export async function searchAccountID(userId: string): Promise<string> {
    let value: string = await searchLinkedID(userId);

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

export async function searchLinkedID(userId: string): Promise<string> {
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
