const { User } = require("../models/user");

//Middleware checks if the user exists and is active
const checkUserStatus = async (req, res, next) => {
    try {
        const userId = req.auth.id; //Req.auth is set by the JWT middleware

        const user = await User.findById(userId);

        if (!user) {
            return res.status(401).json({
                error: true,
                message: "User not found"
            });
        }

        if (user.status !== "active") {
            return res.status(401).json({
                error: true,
                message: "Account is not active"
            });
        }

        if (!user.isVerified) {
            return res.status(401).json({
                error: true,
                message: "Account is not verified"
            });
        }

        //Attach user information to the request for use in the next middleware
        req.user = user;
        next();

    } catch (error) {
        return res.status(500).json({
            error: true,
            message: "Error checking user status",
            details: error.message
        });
    }
};

//Middleware checks for admin permissions
const requireAdmin = async (req, res, next) => {
    try {
        //Check if the user has been set by the checkUserStatus middleware
        if (!req.user) {
            return res.status(401).json({
                error: true,
                message: "User information not found"
            });
        }

        if (!req.user.isAdmin) {
            return res.status(403).json({
                error: true,
                message: "Admin access required"
            });
        }

        next();

    } catch (error) {
        return res.status(500).json({
            error: true,
            message: "Error checking admin status",
            details: error.message
        });
    }
};

//Middleware checks ownership (user can only access their own data)
const requireOwnership = (resourceField = 'userId') => {
    return async (req, res, next) => {
        try {
            const userId = req.auth.id;
            const resourceUserId = req.params[resourceField] || req.body[resourceField];

            //Admin can access everything
            if (req.user && req.user.isAdmin) {
                return next();
            }

            //User can only access their own data
            if (userId !== resourceUserId) {
                return res.status(403).json({
                    error: true,
                    message: "Access denied. You can only access your own data"
                });
            }

            next();

        } catch (error) {
            return res.status(500).json({
                error: true,
                message: "Error checking ownership",
                details: error.message
            });
        }
    };
};

//Middleware allows both admin and owner access
const requireAdminOrOwner = (resourceField = 'userId') => {
    return async (req, res, next) => {
        try {
            const userId = req.auth.id;
            const resourceUserId = req.params[resourceField] || req.body[resourceField];

            //Admin can access everything
            if (req.user && req.user.isAdmin) {
                return next();
            }

            //Owner can access their own data
            if (userId === resourceUserId) {
                return next();
            }

            return res.status(403).json({
                error: true,
                message: "Access denied. Admin or owner access required"
            });

        } catch (error) {
            return res.status(500).json({
                error: true,
                message: "Error checking admin or owner status",
                details: error.message
            });
        }
    };
};

//Middleware checks if the user is logged in (only requires a valid JWT)
const requireAuth = (req, res, next) => {
    if (!req.auth || !req.auth.id) {
        return res.status(401).json({
            error: true,
            message: "Authentication required"
        });
    }
    next();
};

module.exports = {
    checkUserStatus,
    requireAdmin,
    requireOwnership,
    requireAdminOrOwner,
    requireAuth
}; 