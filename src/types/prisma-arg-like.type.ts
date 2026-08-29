export interface PrismaArgLike {
    where?: object;
    select?: object;
    include?: object;
    data?: any;
    create?: any;
    update?: any;
    orderBy?: object | object[];
    skip?: number;
    take?: number;
    cursor?: object;
    skipDuplicates?: boolean;
    distinct?: any[];
}
