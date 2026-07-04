import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole, UserStatus } from '../common/enums/user-role.enum';
import { normalizeEmail } from '../common/utils/normalize-email';
import { stripUndefined } from '../common/utils/strip-undefined';
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
}
