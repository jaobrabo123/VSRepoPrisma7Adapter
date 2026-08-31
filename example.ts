/**
 * Here's a simple of how to use the VSRepoPrisma7Adapter
 */

import {
    DynamicMethod,
    MethodOptions,
    QueryMethod,
    QueryMethodArg,
    VSLogLevel,
    VSRepository,
    VSRepoWhere,
} from "vsrepo";
import { Prisma, PrismaClient } from "./generated/prisma/client";
import { Prisma7OrmTypes, VSRepoPrisma7Adapter } from "./src";
import { prisma } from "./tests/prisma";

type MyOrmTypes = Prisma7OrmTypes<PrismaClient, Prisma.TransactionClient>;

type User = Prisma.UserGetPayload<{ include: { posts: true } }>;
type UserMethodOptions = MethodOptions<User, MyOrmTypes>;

class UserRepository extends VSRepository<User, number, MyOrmTypes> {
    constructor() {
        super({
            adapter: new VSRepoPrisma7Adapter(prisma, {
                pkName: "id",
                tableName: "user",
                relations: {
                    posts: {
                        mode: "otm",
                        pk: "id",
                        restriction: "set",
                    },
                },
                logLevel: VSLogLevel.DEBUG,
            }),
            pkName: "id",
            logSlowThresholdMs: 200,
            logLevel: VSLogLevel.DEBUG,
        });
    }

    @DynamicMethod()
    declare findOneByEmail: (email: string, options?: UserMethodOptions) => Promise<User | null>;

    @DynamicMethod()
    declare findByEmailEndsWithOrderByEmail: (email: string) => Promise<User[]>;

    @DynamicMethod()
    declare findOneWhere: (where: VSRepoWhere<User>) => Promise<User | null>;

    @QueryMethod('select * from "User" where name is null')
    declare findNameless: (arg: QueryMethodArg<[]>) => Promise<User[]>;

    @DynamicMethod()
    declare deleteManyReturningByIdIn: (ids: number[]) => Promise<User[]>;
}

const userRepository = new UserRepository();

async function example() {
    const result = await userRepository.saveList(
        [
            {
                name: "João",
                email: "joao@vsmail.com",
                posts: [
                    {
                        content: "New project...",
                        title: "Project",
                    },
                ],
            },
            {
                email: "pedro@vsmail.com",
            },
        ],
        { relations: { posts: true } },
    );
    console.log(result);

    const namelessUsers = await userRepository.findNameless({});
    console.log(namelessUsers);

    const joao = await userRepository.findOneByEmail("joao@vsmail.com");
    console.log(joao);

    if (joao) {
        joao.name = "João Azevedo";
        joao.posts = [];

        const joaoUpdated = await userRepository.save(joao, { relations: { posts: true } });
        console.log(joaoUpdated);
    }

    const vsrepoUsers = await userRepository.findByEmailEndsWithOrderByEmail("@vsmail.com");

    const removed = await userRepository.deleteManyReturningByIdIn(vsrepoUsers.map(u => u.id));
    console.log(removed);

    await prisma.$disconnect();
}

example();
