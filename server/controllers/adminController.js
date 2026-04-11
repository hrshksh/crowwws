// Admin controller — business logic for admin panel operations
const prisma = require('../src/prisma');

/**
 * Get platform stats (active users, sessions, reports, flags)
 */
async function getStats() {
    const { getActiveUserCount } = require('../sockets/socketHandler');
    const { getActiveSessionCount } = require('../services/sessionManager');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [reportsToday, flagsToday, activeSessionCount] = await Promise.all([
        prisma.report.count({ where: { createdAt: { gte: today } } }),
        prisma.moderationFlag.count({ where: { createdAt: { gte: today } } }),
        getActiveSessionCount(),
    ]);

    return {
        activeUsers: getActiveUserCount(),
        activeSessions: activeSessionCount,
        reportsToday,
        flagsToday,
    };
}

/**
 * Get reports with optional reviewed filter
 */
async function getReports(reviewed, page = 1, limit = 20) {
    const where = {};
    if (reviewed !== undefined) {
        where.reviewed = reviewed === 'true' || reviewed === true;
    }

    const [reports, total] = await Promise.all([
        prisma.report.findMany({
            where,
            include: {
                reporter: { select: { id: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.report.count({ where }),
    ]);

    // Fetch reported user info separately since we don't have a relation for it
    const enrichedReports = await Promise.all(
        reports.map(async (report) => {
            const reported = await prisma.user.findUnique({
                where: { id: report.reportedId },
                select: { id: true, email: true, isBanned: true },
            });
            return { ...report, reported };
        })
    );

    return { reports: enrichedReports, total, page, limit };
}

/**
 * Ban a user
 */
async function banUser(userId, reason, duration) {
    const user = await prisma.user.update({
        where: { id: userId },
        data: {
            isBanned: true,
            banReason: reason || 'Policy violation',
        },
    });

    // Also add email to banned list
    await prisma.bannedEmail.upsert({
        where: { email: user.email },
        update: { reason: reason || 'Policy violation' },
        create: { email: user.email, reason: reason || 'Policy violation' },
    });

    return user;
}

/**
 * Unban a user
 */
async function unbanUser(userId) {
    const user = await prisma.user.update({
        where: { id: userId },
        data: { isBanned: false, banReason: null },
    });

    // Remove from banned emails
    await prisma.bannedEmail.delete({
        where: { email: user.email },
    }).catch(() => { });

    return user;
}

/**
 * Get moderation flags
 */
async function getFlags(reviewed, page = 1, limit = 20) {
    const where = {};
    if (reviewed !== undefined) {
        where.reviewed = reviewed === 'true' || reviewed === true;
    }

    const [flags, total] = await Promise.all([
        prisma.moderationFlag.findMany({
            where,
            orderBy: { confidence: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.moderationFlag.count({ where }),
    ]);

    // Enrich with user info
    const enrichedFlags = await Promise.all(
        flags.map(async (flag) => {
            const user = await prisma.user.findUnique({
                where: { id: flag.userId },
                select: { id: true, email: true },
            });
            return { ...flag, user };
        })
    );

    return { flags: enrichedFlags, total, page, limit };
}

/**
 * Review a moderation flag
 */
async function reviewFlag(flagId, action) {
    const flag = await prisma.moderationFlag.update({
        where: { id: flagId },
        data: {
            reviewed: true,
            action,
        },
    });

    if (action === 'ban') {
        await banUser(flag.userId, 'Banned after moderation review');
    }

    return flag;
}

/**
 * Get paginated user list
 */
async function getUsers(page = 1, limit = 50, search) {
    const where = {};
    if (search) {
        where.email = { contains: search, mode: 'insensitive' };
    }

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            select: {
                id: true,
                email: true,
                isBanned: true,
                banReason: true,
                createdAt: true,
                _count: { select: { reports: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.user.count({ where }),
    ]);

    // Get count of reports filed against each user
    const enrichedUsers = await Promise.all(
        users.map(async (user) => {
            const reportsAgainst = await prisma.report.count({
                where: { reportedId: user.id },
            });
            return { ...user, reportsAgainst };
        })
    );

    return { users: enrichedUsers, total, page, limit };
}

/**
 * Get analytics data
 */
async function getAnalytics() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Daily active users (users who created sessions in last 30 days)
    const sessions = await prisma.session.findMany({
        where: { startTime: { gte: thirtyDaysAgo } },
        select: { startTime: true, endTime: true, user1Id: true, user2Id: true },
    });

    // Build DAU data
    const dauMap = {};
    for (const session of sessions) {
        const day = session.startTime.toISOString().split('T')[0];
        if (!dauMap[day]) dauMap[day] = new Set();
        dauMap[day].add(session.user1Id);
        dauMap[day].add(session.user2Id);
    }
    const dauByDay = Object.entries(dauMap)
        .map(([date, users]) => ({ date, count: users.size }))
        .sort((a, b) => a.date.localeCompare(b.date));

    // Average session length
    const completeSessions = sessions.filter((s) => s.endTime);
    const avgSessionLength = completeSessions.length > 0
        ? completeSessions.reduce((sum, s) => sum + (s.endTime - s.startTime), 0) / completeSessions.length / 1000 / 60
        : 0;

    // Peak hour
    const hourCounts = new Array(24).fill(0);
    for (const session of sessions) {
        hourCounts[session.startTime.getHours()]++;
    }
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

    // Top keywords would require storing keywords per session — return placeholder
    const topKeywords = [];

    return {
        dauByDay,
        avgSessionLength: Math.round(avgSessionLength * 10) / 10,
        peakHour,
        topKeywords,
    };
}

module.exports = {
    getStats,
    getReports,
    banUser,
    unbanUser,
    getFlags,
    reviewFlag,
    getUsers,
    getAnalytics,
};
