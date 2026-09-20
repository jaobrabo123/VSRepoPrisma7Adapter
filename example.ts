/**
 * Here's a simple of how to use the VSRepoPrisma7Adapter
 */

import {
    DynamicMethod,
    InferMethodType,
    MethodOptions,
    QueryMethod,
    QueryMethodArg,
    VSLogLevel,
    VSRepository,
    VSRepoWhere,
} from "vsrepo";
import { Prisma, PrismaClient } from "./generated/prisma/client";
import { Prisma7OrmTypes, Prisma7Adapter } from "./src";
import { prisma } from "./tests/prisma";

type MyOrmTypes = Prisma7OrmTypes<PrismaClient>;

type User = Prisma.UserGetPayload<{ include: { posts: true } }>;
type UserMethodOptions = MethodOptions<User, MyOrmTypes>;

type Address = Prisma.AddressGetPayload<{ include: { user: true } }>;

class UserRepository extends VSRepository<User, number, MyOrmTypes> {
    constructor() {
        super({
            adapter: new Prisma7Adapter(prisma, {
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
                logSlowThresholdMs: false,
            }),
            logSlowThresholdMs: 200,
            logLevel: VSLogLevel.DEBUG,
        });
    }

    @DynamicMethod()
    declare findOneByEmail: InferMethodType<[email: string], User | null, MyOrmTypes>;

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

export class AddressRepository extends VSRepository<Address, number, MyOrmTypes> {
    constructor() {
        super({
            adapter: new Prisma7Adapter(prisma, {
                pkName: "id",
                tableName: "address",
                relations: {
                    user: {
                        mode: "oto",
                        pk: "id",
                        restriction: "set",
                        nullable: true,
                    },
                },
            }),
        });
    }
}

const addressRepository = new AddressRepository();

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

    const joao = await userRepository.findOneByEmail("joao@vsmail.com", {
        relations: { posts: true },
    });
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

    const user = await userRepository.save({
        name: "Gus",
        email: "gus@vsmail.com",
        balance: 200,
    });
    console.log(
        await userRepository.increment(user.id, "balance", 100, { relations: { posts: true } }),
    );

    console.log(await userRepository.sum("balance"));

    await userRepository.remove(user.id);

    await prisma.$disconnect();
}

example();
