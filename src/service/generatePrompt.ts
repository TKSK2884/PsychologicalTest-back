export function generatePrompt(value: object): string {
    let convertedObject: string = "";

    for (let key in value) {
        convertedObject += key + ":" + value[key] + ",";
    }
    convertedObject = convertedObject.slice(0, -1);
    console.log(convertedObject);

    return `My data is a ${convertedObject}`;
}
