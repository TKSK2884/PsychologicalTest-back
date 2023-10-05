import crypto from "crypto";
import { connectPool } from "../service/db";

export async function generateAccessToken(fetchedID: string): Promise<string> {
    // Create random token
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
