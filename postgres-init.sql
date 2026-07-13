-- CreateTable
CREATE TABLE "Workspace" (
    "slackTeamId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'FREE',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "usagePeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customOpenAIKey" TEXT,
    "customAnthropicKey" TEXT,
    "customGeminiKey" TEXT,
    "customQwenKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("slackTeamId")
);

-- CreateTable
CREATE TABLE "Graph" (
    "id" TEXT NOT NULL,
    "graphJson" TEXT NOT NULL,
    "channelCount" INTEGER NOT NULL DEFAULT 0,
    "days" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Graph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPref" (
    "slackTeamId" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "defaultDays" INTEGER NOT NULL DEFAULT 7,
    "skipForm" BOOLEAN NOT NULL DEFAULT false,
    "autoSave" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPref_pkey" PRIMARY KEY ("slackTeamId","slackUserId")
);

