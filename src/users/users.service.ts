import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { UserRole, UserStatus } from '../common/enums/user-role.enum';
import { type Paginated, paginateQuery } from '../common/pagination/pagination';
import { containsPattern } from '../common/utils/escape-like';
import { normalizeEmail } from '../common/utils/normalize-email';
import { stripUndefined } from '../common/utils/strip-undefined';
import { type ListUsersQueryDto } from './dto/list-users.query.dto';
import { User } from './entities/user.entity';

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash?: string | null;
  role?: UserRole;
  googleId?: string | null;
  avatarUrl?: string | null;
  emailVerifiedAt?: Date | null;
}

export type UpdateUserInput = Partial<
  Pick<
    User,
    'firstName' | 'lastName' | 'avatarUrl' | 'passwordHash' | 'googleId' | 'emailVerifiedAt'
  >
>;

export interface UserAnalyticsSummary {
  total: number;
  byRole: Record<UserRole, number>;
  byStatus: Record<UserStatus, number>;
  newLast7Days: number;
  newLast30Days: number;
  activeLast30Days: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async findByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} was not found`);
    }
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: normalizeEmail(email) } });
  }

  list(query: ListUsersQueryDto): Promise<Paginated<User>> {
    const builder = this.users.createQueryBuilder('user');
    if (query.search) {
      builder.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: containsPattern(query.search) },
      );
    }
    if (query.role) {
      builder.andWhere('user.role = :role', { role: query.role });
    }
    if (query.status) {
      builder.andWhere('user.status = :status', { status: query.status });
    }
    builder
      .orderBy(`user.${query.sortBy}`, query.sortDir, 'NULLS LAST')
      .addOrderBy('user.id', 'ASC');
    return paginateQuery(builder, query);
  }

  async create(input: CreateUserInput): Promise<User> {
    const email = normalizeEmail(input.email);
    const existing = await this.users.exists({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const user = this.users.create({
      email,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      passwordHash: input.passwordHash ?? null,
      role: input.role ?? UserRole.LEARNER,
      status: UserStatus.ACTIVE,
      googleId: input.googleId ?? null,
      avatarUrl: input.avatarUrl ?? null,
      emailVerifiedAt: input.emailVerifiedAt ?? null,
      lastLoginAt: null,
    });
    return this.users.save(user);
  }

  async update(id: string, patch: UpdateUserInput): Promise<User> {
    const user = await this.findByIdOrFail(id);
    Object.assign(user, stripUndefined(patch));
    return this.users.save(user);
  }

  async changeRole(id: string, role: UserRole): Promise<User> {
    const user = await this.findByIdOrFail(id);
    user.role = role;
    return this.users.save(user);
  }

  async setStatus(id: string, status: UserStatus): Promise<User> {
    const user = await this.findByIdOrFail(id);
    user.status = status;
    return this.users.save(user);
  }

  async markLogin(id: string): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: new Date() });
  }

  count(): Promise<number> {
    return this.users.count();
  }

  async analyticsSummary(): Promise<UserAnalyticsSummary> {
    const [total, roleRows, statusRows, newLast7Days, newLast30Days, activeLast30Days] =
      await Promise.all([
        this.users.count(),
        this.countBy('role'),
        this.countBy('status'),
        this.users.count({ where: { createdAt: MoreThanOrEqual(daysAgo(7)) } }),
        this.users.count({ where: { createdAt: MoreThanOrEqual(daysAgo(30)) } }),
        this.users.count({ where: { lastLoginAt: MoreThanOrEqual(daysAgo(30)) } }),
      ]);

    return {
      total,
      byRole: this.fillCounts(Object.values(UserRole), roleRows),
      byStatus: this.fillCounts(Object.values(UserStatus), statusRows),
      newLast7Days,
      newLast30Days,
      activeLast30Days,
    };
  }

  private countBy(column: 'role' | 'status'): Promise<{ key: string; count: string }[]> {
    return this.users
      .createQueryBuilder('user')
      .select(`user.${column}`, 'key')
      .addSelect('COUNT(*)', 'count')
      .groupBy(`user.${column}`)
      .getRawMany<{ key: string; count: string }>();
  }

  private fillCounts<K extends string>(
    keys: K[],
    rows: { key: string; count: string }[],
  ): Record<K, number> {
    const result = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
    for (const row of rows) {
      if (row.key in result) {
        result[row.key as K] = Number(row.count);
      }
    }
    return result;
  }
}
