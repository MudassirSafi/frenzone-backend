const User = require("../models/userModel");

const TASK_TARGETS = {
    likes: 3,
    follows: 2,
};

const defaultOnboarding = (active = false) => ({
    active,
    completed: false,
    likes: 0,
    follows: 0,
    sentGift: false,
    createdClub: false,
    completedAt: null,
});

const normalizeOnboarding = (onboarding, activeFallback = false) => {
    const state = {
        ...defaultOnboarding(activeFallback),
        ...(onboarding?.toObject ? onboarding.toObject() : onboarding || {}),
    };

    state.likes = Math.min(Number(state.likes) || 0, TASK_TARGETS.likes);
    state.follows = Math.min(Number(state.follows) || 0, TASK_TARGETS.follows);
    state.sentGift = state.sentGift === true;
    state.createdClub = state.createdClub === true;
    state.completed =
        state.completed === true ||
        (state.likes >= TASK_TARGETS.likes &&
            state.follows >= TASK_TARGETS.follows &&
            state.sentGift &&
            state.createdClub);
    state.active = state.completed ? false : state.active === true;
    state.completedAt = state.completed
        ? state.completedAt || new Date()
        : state.completedAt || null;

    return state;
};

const markOnboardingTask = async (userId, task) => {
    if (!userId) return null;

    const user = await User.findById(userId).select("onboarding");
    if (!user) return null;

    const onboarding = normalizeOnboarding(user.onboarding);
    if (onboarding.completed || !onboarding.active) return onboarding;

    onboarding.active = true;

    if (task === "like") {
        onboarding.likes = Math.min(onboarding.likes + 1, TASK_TARGETS.likes);
    } else if (task === "follow") {
        onboarding.follows = Math.min(onboarding.follows + 1, TASK_TARGETS.follows);
    } else if (task === "gift") {
        onboarding.sentGift = true;
    } else if (task === "club") {
        onboarding.createdClub = true;
    }

    const completedNow =
        onboarding.likes >= TASK_TARGETS.likes &&
        onboarding.follows >= TASK_TARGETS.follows &&
        onboarding.sentGift &&
        onboarding.createdClub;

    if (completedNow) {
        onboarding.completed = true;
        onboarding.active = false;
        onboarding.completedAt = onboarding.completedAt || new Date();
    }

    user.onboarding = onboarding;
    await user.save();
    return onboarding;
};

const activateOnboarding = async (userId) => {
    if (!userId) return null;

    const user = await User.findById(userId).select("onboarding");
    if (!user) return null;

    const onboarding = normalizeOnboarding(user.onboarding);
    if (!onboarding.completed) {
        onboarding.active = true;
        user.onboarding = onboarding;
        await user.save();
    }
    return onboarding;
};

module.exports = {
    activateOnboarding,
    defaultOnboarding,
    markOnboardingTask,
    normalizeOnboarding,
};