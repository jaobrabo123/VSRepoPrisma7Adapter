import {
    DynamicMethod,
    MethodOptions,
    Ordering,
    VSLogLevel,
    VSRepository,
    VSRepoWhere,
} from "vsrepo";
import { Prisma, PrismaClient } from "../generated/prisma/client";
import { Prisma7OrmTypes } from "../src/types/prisma7-orm-types.type";
import { VSRepoPrisma7Adapter } from "../src/prisma7.adapter";
import { prisma } from "./prisma";

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
                        restriction: "add",
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
    declare findOneWhereOrdered: (
        where: VSRepoWhere<User>,
        order: Ordering<User>,
    ) => Promise<User | null>;
}

const userRepository = new UserRepository();

(async () => {
    const user = await userRepository.findOneByEmail("test@email.com", {
        // relations: { posts: true },
        select: { id: true, posts: { id: true } },
    });
    console.log(user);

    const user2 = await userRepository.findOneWhereOrdered(
        { posts: { _some: { authorId: 1 } } },
        { email: "ASC" },
    );
    console.log(user2);
})();
