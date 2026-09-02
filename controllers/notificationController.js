const admin = require("firebase-admin");
const User = require("../models/userModel")
const {google} = require('googleapis')
const axios = require("axios")
require("dotenv").config();

const SCOPES = ['https://www.googleapis.com/auth/firebase.messaging'];
const serviceAccount = require("../firebaseFrenzoneNew.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const createDynamicLink = async (link) => {
  const apiKey = process.env.FIREBASE_WEB_API_KEY; // Get this from your Firebase project settings
  const dynamicLinkDomain = process.env.FIREBASE_BASE_URL; // Your Dynamic Links domain

  const requestBody = {
    dynamicLinkInfo: {
      domainUriPrefix: dynamicLinkDomain,
      link: link,
      androidInfo: {
        androidPackageName: 'com.sheesX.Frenzone', // Your Android package name
      },
      iosInfo: {
        iosBundleId: 'app.Frenzone.sheesX',
      }
    },
    suffix: {
      option: 'SHORT' // You can also use 'UNGUESSABLE'
    }
  };

  try {
    const response = await axios.post(`https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key=${apiKey}`, requestBody);
    return {shortLink: response.data.shortLink}
  } catch (error) {
    console.error('Error creating dynamic link:', error);
    throw error;
  }
};

const sendNotification = async(userid, title, body, type = null, modelid = null, subType = null, modelSub = null, sender = null, username=null, threadid=null, comment='false', rich = {})=>{
    // try{
    //     const user = await User.findById(userid)
    //     if(!user){
    //         throw Error ("User Not Found")
    //     }

    //     await Promise.all(
    //         user.fcmtoken.map(async(token)=>{
    //             const message = {
    //                 notification: {
    //                     title,
    //                     body
    //                 },
    //                 token
    //             };
    //             await admin.messaging().send(message)
    //         })
    //     )

    // }catch(error){
    //     console.error(error)
    // }

    if(sender){
      if(sender == userid){
        return;
      }
    }
    
    try{
        const user = await User.findById(userid)
        if(!user){
            throw Error ("User Not Found")
        }

        await Promise.all(
            user.fcmtoken.map(async(token)=>{
                const key = serviceAccount;
                const jwtClient = new google.auth.JWT(
                key.client_email,
                null,
                key.private_key,
                SCOPES,
                null
                );
                jwtClient.authorize(async function(err, tokens) {
                if (err) {
                    throw Error("Error in Auth2.0 access token")
                }

                // console.log('Successfully obtained access token:', tokens.access_token);
                // console.log("token: ", token)
                var message
                if(type){
                  message = {
                    message: {
                      token,
                      notification: {
                        title,
                        body,
                      },
                      android: {
                        notification: {
                          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                          icon: 'launcher_icon',
                          sound: 'default',
                          channelId: 'fcm_default_channel',
                        },
                      },
                      data: {
                        type,
                        modelid: modelid?.toString?.() || ""
                      }
                    },
                  };
                  if (rich.imageUrl) {
                    message.message.notification.image = rich.imageUrl;
                    message.message.android.notification.image = rich.imageUrl;
                    message.message.apns = {
                      payload: { aps: { "mutable-content": 1 } },
                      fcm_options: { image: rich.imageUrl },
                    };
                    message.message.data.imageUrl = rich.imageUrl;
                  }
                  if (rich.linkUrl) message.message.data.linkUrl = rich.linkUrl;
                  if (rich.actionLabel) message.message.data.actionLabel = rich.actionLabel;
                  if(subType){
                    message.message.data["subType"] = subType,
                    message.message.data["modelSub"] = modelSub
                  }
                  if(username){
                    message.message.data['username'] = username;
                    message.message.data['threadid'] = threadid
                  }
                  if(comment){
                    message.message.data['comment'] = comment
                  }else{
                    message.message.data['comment'] = 'false'
                  }
                }else{
                  message = {
                    message: {
                      token,
                      notification: {
                        title,
                        body,
                        ...(rich.imageUrl ? { image: rich.imageUrl } : {}),
                      },
                      android: {
                        notification: {
                          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                          icon: 'launcher_icon',
                          sound: 'default',
                          channelId: 'fcm_default_channel',
                          ...(rich.imageUrl ? { image: rich.imageUrl } : {}),
                        },
                      },
                      ...(rich.imageUrl ? {
                        apns: {
                          payload: { aps: { "mutable-content": 1 } },
                          fcm_options: { image: rich.imageUrl },
                        },
                      } : {}),
                      data: {
                        ...(rich.imageUrl ? { imageUrl: rich.imageUrl } : {}),
                        ...(rich.linkUrl ? { linkUrl: rich.linkUrl } : {}),
                        ...(rich.actionLabel ? { actionLabel: rich.actionLabel } : {}),
                      },
                    },
                  };
                }

                try {
                  const response = await axios.post(
                    `https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`,
                    message,
                    {
                      headers: {
                        'Authorization': `Bearer ${tokens.access_token}`,
                        'Content-Type': 'application/json',
                      },
                    }
                  );
                  console.log('Message sent successfully!');
                } catch (error) {
                  console.log("error: ", error)
                  console.error('Error sending message:', error.message);
                }
                });
            })
        )

    }catch(error){
        console.error(error)
    }
}

const sendCustomNotification = async(userid, title, body, rich = {}) => {
  try{
      const user = await User.findById(userid)
      if(!user){
          throw Error ("User Not Found")
      }

      await Promise.all(
          user.fcmtoken.map(async(token)=>{
              const key = serviceAccount;
              const jwtClient = new google.auth.JWT(
              key.client_email,
              null,
              key.private_key,
              SCOPES,
              null
              );
              jwtClient.authorize(async function(err, tokens) {
              if (err) {
                  throw Error("Error in Auth2.0 access token")
              }

              console.log('Successfully obtained access token:', tokens.access_token);
              console.log("token: ", token)
              const message = {
                message: {
                  token,
                  notification: {
                    title,
                    body,
                  },
                  android: {
                    notification: {
                      clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                      icon: 'launcher_icon',
                      sound: 'default',
                      channelId: 'fcm_default_channel',
                      ...(rich.imageUrl ? { image: rich.imageUrl } : {}),
                    },
                  },
                  ...(rich.imageUrl ? {
                    apns: {
                      payload: { aps: { "mutable-content": 1 } },
                      fcm_options: { image: rich.imageUrl },
                    },
                  } : {}),
                  data: {
                    ...(rich.imageUrl ? { imageUrl: rich.imageUrl } : {}),
                    ...(rich.linkUrl ? { linkUrl: rich.linkUrl } : {}),
                    ...(rich.actionLabel ? { actionLabel: rich.actionLabel } : {}),
                  },
                },
              };
              if (rich.imageUrl) {
                message.message.notification.image = rich.imageUrl;
              }
            
              try {
                const response = await axios.post(
                  `https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`,
                  message,
                  {
                    headers: {
                      'Authorization': `Bearer ${tokens.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  }
                );
                console.log('Message sent successfully:', response.data);
              } catch (error) {
                console.error('Error sending message:', error);
              }
              });
          })
      )
    }catch(error){
        console.error(error)
        throw Error ("Notification Error: ", error.message)
    }
}

const sendNotificationUpdated = async(req, res)=>{
    try{
        console.log(req.body)
        var {userid, title, body, imageUrl, linkUrl, actionLabel, type, modelid} = req.body
        const user = await User.findById(userid)
        if(!user){
            throw Error ("User Not Found")
        }

        await Promise.all(
            user.fcmtoken.map(async(token)=>{
                const key = serviceAccount;
                const jwtClient = new google.auth.JWT(
                key.client_email,
                null,
                key.private_key,
                SCOPES,
                null
                );
                jwtClient.authorize(async function(err, tokens) {
                if (err) {
                    throw Error("Error in Auth2.0 access token")
                }

                console.log('Successfully obtained access token:', tokens.access_token);
                console.log("token: ", token)
                const message = {
                  message: {
                    token,
                    notification: {
                      title,
                      body,
                      ...(imageUrl ? { image: imageUrl } : {}),
                    },
                    android: {
                      notification: {
                        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                        icon: 'launcher_icon',
                        sound: 'default',
                        channelId: 'fcm_default_channel',
                        ...(imageUrl ? { image: imageUrl } : {}),
                      },
                    },
                    ...(imageUrl ? {
                      apns: {
                        payload: { aps: { "mutable-content": 1 } },
                        fcm_options: { image: imageUrl },
                      },
                    } : {}),
                    data: {
                      ...(type ? { type: type.toString() } : {}),
                      ...(modelid ? { modelid: modelid.toString() } : {}),
                      ...(imageUrl ? { imageUrl: imageUrl.toString() } : {}),
                      ...(linkUrl ? { linkUrl: linkUrl.toString() } : {}),
                      ...(actionLabel ? { actionLabel: actionLabel.toString() } : {}),
                    },
                  },
                };
              
                try {
                  const response = await axios.post(
                    `https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`,
                    message,
                    {
                      headers: {
                        'Authorization': `Bearer ${tokens.access_token}`,
                        'Content-Type': 'application/json',
                      },
                    }
                  );
                  console.log('Message sent successfully:', response.data);
                } catch (error) {
                  console.error('Error sending message:', error);
                }
                });
            })
        )

        res.status(200).send({
            message: "Notifcation Sent"
        })

    }catch(error){
        console.error(error)
    }
}

const sendBroadcast = async (userId, title, body) => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.fcmtoken || user.fcmtoken.length === 0) {
      console.log('User not found or has no FCM tokens');
      return;
    }

    console.log("title: ", title, "body: ", body)
    // ---- 1. Get a fresh access token (once per call) ----
    const jwtClient = new google.auth.JWT(
      serviceAccount.client_email,
      null,
      serviceAccount.private_key,
      SCOPES
    );
    const { access_token } = await jwtClient.authorize();

    // ---- 2. Helper – build the FCM payload for a single token ----
    const buildPayload = (token) => ({
      message: {
        token,
        notification: { title, body }
      },
    });

    // ---- 3. Send to every token in parallel ----
    const results = await Promise.all(
      user.fcmtoken.map(async (token) => {
        const payload = buildPayload(token);
        try {
          const resp = await axios.post(
            `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
            payload,
            {
              headers: {
                Authorization: `Bearer ${access_token}`,
                'Content-Type': 'application/json',
              },
              timeout: 8000,
            }
          );
          return { token, success: true, data: resp.data };
        } catch (err) {
          const msg = err.response?.data?.error?.message || err.message;
          return { token, success: false, error: msg };
        }
      })
    );

    console.log('FCM results for user', userId, results);
  } catch (err) {
    console.error('sendBroadcast error:', err);
  }
};

module.exports = {sendNotification, sendNotificationUpdated, sendBroadcast, sendCustomNotification  }
