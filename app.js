import * as dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { assert } from 'superstruct';

const prisma = new PrismaClient();

const app = express();
app.use(express.json());