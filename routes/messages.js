var express = require('express');
var router = express.Router();
let messageModel = require('../schemas/messages');
let mongoose = require('mongoose');
const { CheckLogin } = require('../utils/authHandler');
let multer = require('multer');
let path = require('path');

let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/messages/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
let upload = multer({ storage });

router.get('/', CheckLogin, async function (req, res, next) {
  try {
    let currentUserId = new mongoose.Types.ObjectId(req.user._id);

    let messages = await messageModel.aggregate([
      {
        $match: {
          $or: [
            { from: currentUserId },
            { to: currentUserId }
          ]
        }
      },
      {
        $addFields: {
          partner: {
            $cond: {
              if: { $eq: ['$from', currentUserId] },
              then: '$to',
              else: '$from'
            }
          }
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$partner',
          lastMessage: { $first: '$$ROOT' }
        }
      },
      { $replaceRoot: { newRoot: '$lastMessage' } },
      {
        $lookup: {
          from: 'users',
          localField: 'from',
          foreignField: '_id',
          as: 'from'
        }
      },
      { $unwind: '$from' },
      {
        $lookup: {
          from: 'users',
          localField: 'to',
          foreignField: '_id',
          as: 'to'
        }
      },
      { $unwind: '$to' },
      {
        $project: {
          'from.password': 0,
          'from.forgotPasswordToken': 0,
          'from.forgotPasswordTokenExp': 0,
          'to.password': 0,
          'to.forgotPasswordToken': 0,
          'to.forgotPasswordTokenExp': 0
        }
      }
    ]);

    res.send(messages);
  } catch (error) {
    res.status(404).send(error.message);
  }
});

router.get('/:userID', CheckLogin, async function (req, res, next) {
  try {
    let currentUserId = req.user._id;
    let userID = req.params.userID;

    let messages = await messageModel.find({
      $or: [
        { from: currentUserId, to: userID },
        { from: userID, to: currentUserId }
      ]
    })
      .populate('from', 'username fullName avatarUrl')
      .populate('to', 'username fullName avatarUrl')
      .sort({ createdAt: 1 });

    res.send(messages);
  } catch (error) {
    res.status(404).send(error.message);
  }
});

router.post('/', CheckLogin, upload.single('file'), async function (req, res, next) {
  try {
    let currentUserId = req.user._id;
    let { to, text } = req.body;

    let messageContent;
    if (req.file) {
      messageContent = {
        type: 'file',
        text: req.file.path
      };
    } else {
      messageContent = {
        type: 'text',
        text: text
      };
    }

    let newMessage = new messageModel({
      from: currentUserId,
      to: to,
      messageContent: messageContent
    });

    await newMessage.save();
    await newMessage.populate('from', 'username fullName avatarUrl');
    await newMessage.populate('to', 'username fullName avatarUrl');

    res.send(newMessage);
  } catch (error) {
    res.status(404).send(error.message);
  }
});

module.exports = router;
