export interface Data {
    grant_type: string;
    client_id: string | undefined;
    redirect_uri: string | undefined;
    code: string;
}

export interface ResultObject {
    select_test: number;
    select_test_name: string;
    content: string;
    time_date: Date;
}

export interface TestListObject {
    test_name: string;
}

export interface indexingString {
    [key: string]: string;
}
