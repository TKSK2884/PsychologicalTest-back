import axios from "axios";
import qs from "qs";
import { Data } from "../../structure/type";

export async function kakaoLogin(
    code: string,
    tokenUrl: string,
    accessToken: string
): Promise<{ id: string; nickname: string } | null> {
    const data: Data = {
        grant_type: "authorization_code",
        client_id: process.env.KAKAO_ACCESS_KEY,
        redirect_uri: process.env.KAKAO_REDIRECT_URI,
        code: code,
    };

    let fetchedID: string = "";
    let fetchedNickname: string = "";

    try {
        let kakaoResponse = await axios.post(tokenUrl, qs.stringify(data), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });

        accessToken = kakaoResponse.data.access_token;

        const userInfoUrl: string = "https://kapi.kakao.com/v2/user/me";

        let kakaoUserInfo = await axios.get(userInfoUrl, {
            headers: {
                Authorization: "Bearer " + accessToken,
            },
        });

        fetchedID = kakaoUserInfo.data.id;
        fetchedNickname = kakaoUserInfo.data.properties.nickname;
    } catch (error) {
        return null;
    }

    return {
        id: fetchedID,
        nickname: fetchedNickname,
    };
}
