import { Configuration, OpenAIApi } from "openai";
import dotenv from "dotenv";

dotenv.config();

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

let testResult: string = "";

export async function callOpenAIApi(
    prompt: string,
    systemMessage: string
): Promise<string | null> {
    if (!configuration.apiKey) {
        console.log("API key is missing");
        return null;
    }

    try {
        const completion = await openai.createChatCompletion({
            model: "gpt-4o-mini",
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

        testResult = completion.data.choices[0].message?.content ?? "";

        return testResult;
    } catch (error) {
        if (error.response) {
            console.error(error.response.status, error.response.data);
        } else {
            console.error(`Error with OpenAI API request: ${error.message}`);
        }
        return null;
    }
}
