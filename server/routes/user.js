const { User } = require("../models/user");
const { ImageUpload } = require("../models/imageUpload");
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");
const {
  sendEmailVerification,
  sendEmailResetPassword,
} = require("../config/EmailServices");
const { checkUserStatus, requireAuth, requireAdmin, requireAdminOrOwner } = require("../helper/authorization");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client();
async function verify(token) {
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.CLIENT_ID,
  });
  const payload = ticket.getPayload();
  const userid = payload["sub"];
  console.log("userid", userid);
  return payload;
}

const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.cloudinary_Config_Cloud_Name,
  api_key: process.env.cloudinary_Config_api_key,
  api_secret: process.env.cloudinary_Config_api_secret,
  secure: true,
});

// ------------ img upload

var imagesArray = [];

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads");
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}_${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
});

//Only admins or logged-in users are allowed to upload an avatar
router.post(`/upload`, requireAuth, checkUserStatus, upload.array("images"), async (req, res) => {
  imagesArray = [];

  try {
    for (let i = 0; i < req.files.length; i++) {
      const options = {
        use_filename: true,
        unique_filename: false,
        overwrite: false,
      };

      const img = await cloudinary.uploader.upload(
        req.files[i].path,
        options,
        function (error, result) {
          imagesArray.push(result.secure_url);
          fs.unlinkSync(`uploads/${req.files[i].filename}`);
        }
      );
    }

    let imagesUploaded = new ImageUpload({
      images: imagesArray,
    });

    imagesUploaded = await imagesUploaded.save();
    return res.status(200).json(imagesArray);
  } catch (err) {
    console.log(err);
  }
});

// ------------ img upload

// Validation functions
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhone = (phone) => {
  const phoneRegex = /^[0-9]{10,11}$/;
  return phoneRegex.test(phone);
};

const validatePassword = (password) => {
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};

const validateSignupData = (data) => {
  const errors = {};
  const { name, phone, email, password, confirmPassword } = data;

  // Name validation
  if (!name || !name.trim()) {
    errors.name = "Full name cannot be empty";
  } else if (name.trim().length < 2) {
    errors.name = "Full name must have at least 2 characters";
  } else if (name.trim().length > 50) {
    errors.name = "Full name must not exceed 50 characters";
  }

  // Email validation
  if (!email || !email.trim()) {
    errors.email = "Email cannot be empty";
  } else if (!validateEmail(email)) {
    errors.email = "Email is in an incorrect format";
  }

  // Phone validation
  if (!phone || !phone.trim()) {
    errors.phone = "Phone number cannot be left blank";
  } else if (!validatePhone(phone)) {
    errors.phone = "Phone number must have 10-11 digits";
  }

  // Password validation
  if (!password) {
    errors.password = "Password cannot be left blank";
  } else if (password.length < 8) {
    errors.password = "Password must be at least 8 characters long";
  } else if (!validatePassword(password)) {
    errors.password = "Password must have at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character";
  }

  // Confirm password validation
  if (!confirmPassword) {
    errors.confirmPassword = "Password confirmation cannot be left blank";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "Password confirmation does not match";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

router.post(`/signup`, async (req, res) => {
  const { name, phone, email, password, confirmPassword, isAdmin } = req.body;

  try {
    // Validate input data
    const validation = validateSignupData(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: true,
        message: "Invalid data",
        errors: validation.errors
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        error: true,
        message: "This email has already been used"
      });
    }

    const existingUserByPhone = await User.findOne({ phone: phone });
    if (existingUserByPhone) {
      return res.status(400).json({
        error: true,
        message: "This phone number has already been used, you can log in with this phone number"
      });
    }

    // Hash password
    const hashPassword = await bcrypt.hash(password, 10);

    // Create verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // Create user
    const result = await User.create({
      name: name.trim(),
      phone: phone.trim(),
      email: email.toLowerCase().trim(),
      password: hashPassword,
      isAdmin: isAdmin || false,
      verificationToken,
      isVerified: false,
    });

    // Generate JWT token
    const token = jwt.sign(
      { email: result.email, id: result._id },
      process.env.JSON_WEB_TOKEN_SECRET_KEY,
      { expiresIn: '30d' }
    );

    // Create verification link
    const verificationLink = `${req.protocol}://${req.get(
      "host"
    )}/api/user/signup/verify/${verificationToken}`;

    // Send email verification
    try {
      await sendEmailVerification(name, email, verificationLink);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Continue with success response even if email fails
    }

    res.status(200).json({
      error: false,
      message: "Account registration successful! Please check your email to verify your account.",
      user: {
        id: result._id,
        name: result.name,
        email: result.email,
        phone: result.phone,
        isAdmin: result.isAdmin,
        isVerified: result.isVerified
      },
      token: token,
    });
  } catch (error) {
    console.error('Signup error:', error);

    // Handle specific MongoDB errors
    if (error.code === 11000) {
      if (error.keyPattern && error.keyPattern.email) {
        return res.status(400).json({
          error: true,
          message: "This email has already been used"
        });
      }
      if (error.keyPattern && error.keyPattern.phone) {
        return res.status(400).json({
          error: true,
          message: "This phone number has already been used, you can log in with this phone number"
        });
      }
    }

    res.status(500).json({
      error: true,
      message: "An error occurred during registration. Please try again later.",
      notify: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

router.get(`/signup/verify/:token`, async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({ verificationToken: token });

    //check user token
    if (!user) {
      return res.status(400).json({ message: "Token is not valid!" });
    }

    //verify user
    user.status = "active";
    user.isVerified = true;
    user.verificationToken = null;

    await user.save();
    return res.json({
      message: "Account verified successfully, you can now log in",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to determine if input is email or phone
const isEmail = (input) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(input);
};

const isPhone = (input) => {
  const phoneRegex = /^[0-9]{10,11}$/;
  return phoneRegex.test(input);
};

router.post(`/login`, async (req, res) => {
  const { emailOrPhone, password } = req.body;

  try {
    // Validate input
    if (!emailOrPhone || !emailOrPhone.trim()) {
      return res.status(400).json({
        error: true,
        message: "Email or phone number cannot be empty"
      });
    }

    if (!password) {
      return res.status(400).json({
        error: true,
        message: "Password cannot be empty"
      });
    }

    let existingUser;
    const cleanInput = emailOrPhone.trim();

    // Determine if input is email or phone and find user accordingly
    if (isEmail(cleanInput)) {
      existingUser = await User.findOne({ email: cleanInput.toLowerCase() });
    } else if (isPhone(cleanInput)) {
      existingUser = await User.findOne({ phone: cleanInput });
    } else {
      return res.status(400).json({
        error: true,
        message: "Please enter a valid email or phone number"
      });
    }

    if (!existingUser) {
      return res.status(400).json({
        error: true,
        message: "Account does not exist"
      });
    }

    if (existingUser.isVerified == false) {
      return res.status(400).json({
        error: true,
        message: "Account not yet verified. Please check your email to verify your account.",
      });
    }

    const matchPassword = await bcrypt.compare(password, existingUser.password);

    if (!matchPassword) {
      return res.status(400).json({
        error: true,
        message: "Incorrect password"
      });
    }

    const token = jwt.sign(
      { email: existingUser.email, id: existingUser._id },
      process.env.JSON_WEB_TOKEN_SECRET_KEY,
      { expiresIn: '30d' }
    );

    res.status(200).json({
      error: false,
      user: {
        id: existingUser._id,
        name: existingUser.name,
        email: existingUser.email,
        phone: existingUser.phone,
        isAdmin: existingUser.isAdmin,
        isVerified: existingUser.isVerified
      },
      token: token,
      message: "Login successful",
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({
      error: true,
      message: "An error occurred. Please try again later.",
      notify: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

router.post(`/google-auth`, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: true, message: "Missing Google token" });
    }

    const payload = await verify(token); //Verify must be a Google ID Token authentication function
    const { email, name, picture } = payload;
    let user = await User.findOne({ email });

    //If the user has registered with email/password
    if (user && user.password) {
      return res.status(400).json({
        error: true,
        message: "Email is already registered via another method. Please log in using email & password.",
      });
    }

    if (!user) {
      user = await User.create({
        name,
        email,
        password: null,
        images: [picture],
        isAdmin: false,
        status: "active",
        isVerified: true, // ✅ Fix: Set verified true cho Google auth users
      });
    } else {
      user.name = name;
      user.images = [picture];
      user.isVerified = true; //✅ Fix: Ensure existing users are also verified
      await user.save();
    }

    const tokenReturn = jwt.sign(
      { email: user.email, id: user._id },
      process.env.JSON_WEB_TOKEN_SECRET_KEY,
      { expiresIn: '7d' }
    );

    res.status(200).send({
      user,
      token: tokenReturn,
      msg: "Login successful",
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      message: "Google authentication failed",
      notify: error.message,
    });
  }
});

// router.post(`/authWithGoogle`, async (req, res) => {
//   const { name, phone, email, password, images, isAdmin } = req.body;
//   try {
//     const existingUser = await User.findOne({ email: email });

//     if (!existingUser) {
//       const result = await User.create({
//         name: name,
//         phone: phone,
//         email: email,
//         password: null,
//         images: images,
//         isAdmin: isAdmin,
//       });

//       const token = jwt.sign(
//         { email: result.email, id: result._id },
//         process.env.JSON_WEB_TOKEN_SECRET_KEY
//       );

//       res.status(200).send({
//         user: result,
//         token: token,
//         msg: "Login successful",
//       });
//     } else {
//       const existingUser = await User.findOne({ email: email });
//       const token = jwt.sign(
//         { email: existingUser.email, id: existingUser._id },
//         process.env.JSON_WEB_TOKEN_SECRET_KEY
//       );
//       res.status(200).send({
//         user: existingUser,
//         token: token,
//         msg: "Login successful",
//       });
//     }
//   } catch (error) {
//     res.status(500).json({ error: true, message: "Something went wrong" });
//     console.log(error);
//   }
// });

router.post(`/forgot-password`, async (req, res) => {
  try {
    const { emailOrPhone } = req.body;

    // Validate input
    if (!emailOrPhone || !emailOrPhone.trim()) {
      return res.status(400).json({
        error: true,
        message: "Email or phone number cannot be empty"
      });
    }

    let user;
    const cleanInput = emailOrPhone.trim();

    // Determine if input is email or phone and find user accordingly
    if (isEmail(cleanInput)) {
      user = await User.findOne({ email: cleanInput.toLowerCase() });
    } else if (isPhone(cleanInput)) {
      user = await User.findOne({ phone: cleanInput });
    } else {
      return res.status(400).json({
        error: true,
        message: "Please enter a valid email or phone number"
      });
    }

    if (!user) {
      return res.status(400).json({
        error: true,
        message: "No account found with this information"
      });
    }

    // Create token verify
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetToken = resetToken;
    user.resetTokenExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Create reset link
    const resetLink = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;

    // Send email reset password (only if user has email)
    if (user.email) {
      try {
        await sendEmailResetPassword(user.email, resetLink);
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        return res.status(500).json({
          error: true,
          message: "Unable to send email. Please try again later.",
        });
      }
    } else {
      return res.status(400).json({
        error: true,
        message: "This account does not have an email to send the password reset link",
      });
    }

    res.status(200).json({
      error: false,
      message: "The password reset link has been sent to your email",
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      error: true,
      message: "An error occurred. Please try again later.",
      notify: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    // Validate input
    if (!token) {
      return res.status(400).json({
        error: true,
        message: "Invalid token"
      });
    }

    if (!password) {
      return res.status(400).json({
        error: true,
        message: "Password cannot be empty"
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        error: true,
        message: "Password must be at least 8 characters long"
      });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        error: true,
        message: "Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character"
      });
    }

    const user = await User.findOne({ resetToken: token });

    if (!user) {
      return res.status(400).json({
        error: true,
        message: "Token is invalid or has expired"
      });
    }

    // Check if token is expired (if resetTokenExpires field exists)
    if (user.resetTokenExpires && user.resetTokenExpires < Date.now()) {
      return res.status(400).json({
        error: true,
        message: "Token has expired. Please create a new request."
      });
    }

    // Create new hash password
    const hashPassword = await bcrypt.hash(password, 10);
    user.password = hashPassword;

    // Delete reset token after use
    user.resetToken = null;
    user.resetTokenExpires = null;
    await user.save();

    return res.status(200).json({
      error: false,
      message: "Password reset successfully!",
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      error: true,
      message: "An error occurred. Please try again later.",
      notify: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

//Only the admin or the user themselves can change the password
router.put(`/changePassword/:id`, requireAuth, checkUserStatus, async (req, res) => {
  try {
    //Check access permissions
    if (!req.user.isAdmin && req.params.id !== req.auth.id) {
      return res.status(403).json({
        error: true,
        message: "Access denied. You can only change your own password"
      });
    }

    const { password, newPass } = req.body;

    const existingUser = await User.findById(req.params.id);

    if (!existingUser) {
      return res.status(404).json({ error: true, message: "User not found" });
    }

    const matchPassword = await bcrypt.compare(password, existingUser.password);

    if (!matchPassword) {
      return res
        .status(400)
        .json({ error: true, message: "Current password is incorrect" });
    } else {
      let newPassword;

      if (newPass) {
        newPassword = bcrypt.hashSync(newPass, 10);
      } else {
        newPassword = existingUser.hashPassword;
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        {
          password: newPassword,
        },
        {
          new: true,
        }
      );

      if (!user) {
        return res.status(404).send({ message: "User ID not found" });
      }

      return res.status(200).send(user);
    }
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

//Only admins can view all users
router.get(`/`, requireAuth, checkUserStatus, requireAdmin, async (req, res) => {
  try {
    const userList = await User.find();

    if (!userList) {
      return res.status(500).json({ success: false });
    }

    return res.status(200).send(userList);
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

//Only the Admin or the user themselves can view information
router.get(`/:id`, requireAuth, checkUserStatus, async (req, res) => {
  try {
    //Check access permissions
    if (!req.user.isAdmin && req.params.id !== req.auth.id) {
      return res.status(403).json({
        error: true,
        message: "Access denied. You can only view your own profile"
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        error: true,
        message: "User ID not found",
      });
    }
    return res.status(200).send(user);
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

//Only admins can delete users
router.delete(`/:id`, requireAuth, checkUserStatus, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: true,
        message: "User ID not found",
        success: false,
      });
    }
    return res.status(200).json({
      message: "User deleted successfully",
      success: true,
    });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

//Only admins can view user statistics
router.get(`/get/count`, requireAuth, checkUserStatus, requireAdmin, async (req, res) => {
  try {
    const userCount = await User.countDocuments();

    return res.status(200).send({ userCount: userCount });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

//Only the Admin or the user themselves can update information
router.put(`/:id`, requireAuth, checkUserStatus, async (req, res) => {
  try {
    //Check access permissions
    if (!req.user.isAdmin && req.params.id !== req.auth.id) {
      return res.status(403).json({
        error: true,
        message: "Access denied. You can only update your own profile"
      });
    }

    const { name, phone, email, password, address } = req.body;

    const userExist = await User.findById(req.params.id);
    if (!userExist) {
      return res.status(404).json({
        error: true,
        message: "User ID not found"
      });
    }

    let updateData = {
      name: name,
      phone: phone,
      email: email,
      images: imagesArray.length > 0 ? imagesArray : userExist.images,
    };

    //If there is an address, update it
    if (address) {
      updateData.address = address;
    }

    //If there is a password, hash and update it
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    return res.status(200).send(user);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Routes for address management
//Only the Admin or the user themselves can add the address
router.post(`/:id/address`, requireAuth, checkUserStatus, async (req, res) => {
  try {
    //Check access permissions
    if (!req.user.isAdmin && req.params.id !== req.auth.id) {
      return res.status(403).json({
        error: true,
        message: "Access denied. You can only manage your own addresses"
      });
    }

    const { city, details, moreInfo } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: true, message: "User not found" });
    }

    user.address.push({
      city,
      details,
      moreInfo
    });

    await user.save();

    return res.status(200).json({
      message: "Address added successfully",
      user: user
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      message: "Something went wrong",
      notify: error.message
    });
  }
});

//Only the Admin or the user themselves can update the address
router.put(`/:id/address/:addressId`, requireAuth, checkUserStatus, async (req, res) => {
  try {
    //Check access permissions
    if (!req.user.isAdmin && req.params.id !== req.auth.id) {
      return res.status(403).json({
        error: true,
        message: "Access denied. You can only manage your own addresses"
      });
    }

    const { city, details, moreInfo } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: true, message: "User not found" });
    }

    const address = user.address.id(req.params.addressId);
    if (!address) {
      return res.status(404).json({ error: true, message: "Address not found" });
    }

    address.city = city;
    address.details = details;
    address.moreInfo = moreInfo;

    await user.save();

    return res.status(200).json({
      message: "Address updated successfully",
      user: user
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      message: "Something went wrong",
      notify: error.message
    });
  }
});

//Only the Admin or the user themselves can delete the address
router.delete(`/:id/address/:addressId`, requireAuth, checkUserStatus, async (req, res) => {
  try {
    //Check access permissions
    if (!req.user.isAdmin && req.params.id !== req.auth.id) {
      return res.status(403).json({
        error: true,
        message: "Access denied. You can only manage your own addresses"
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: true, message: "User not found" });
    }

    const address = user.address.id(req.params.addressId);
    if (!address) {
      return res.status(404).json({ error: true, message: "Address not found" });
    }

    address.remove();
    await user.save();

    return res.status(200).json({
      message: "Address deleted successfully",
      user: user
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      message: "Something went wrong",
      notify: error.message
    });
  }
});

module.exports = router;
