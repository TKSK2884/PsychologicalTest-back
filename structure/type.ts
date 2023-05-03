export interface Data {
    grant_type: string;
    client_id: string | undefined;
    redirect_uri: string | undefined;
    code: string;
}

export interface ResultObject {
    select_test: string;
    content: string;
    time_date: Data;
}
