export interface Data {
    grant_type: string;
    client_id: string | undefined;
    redirect_uri: string | undefined;
    code: string;
}

export interface ResultObject {
    select_test_id: number;
    select_test: string;
    content: string;
    time_date: Date;
}

export interface indexingString {
    [key: string]: string;
}
