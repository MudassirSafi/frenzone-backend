const { Configuration, PlaidApi, Products, PlaidEnvironments} = require('plaid');
const User = require("../models/userModel")
require('dotenv').config();
const APP_PORT = process.env.APP_PORT || 8000;
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const PLAID_PRODUCTS = (process.env.PLAID_PRODUCTS || Products.Transactions).split(
  ',',
);
const PLAID_COUNTRY_CODES = (process.env.PLAID_COUNTRY_CODES || 'US').split(
  ',',
);
const PLAID_REDIRECT_URI = process.env.PLAID_REDIRECT_URI || '';
const PLAID_ANDROID_PACKAGE_NAME = process.env.PLAID_ANDROID_PACKAGE_NAME || '';
let ACCESS_TOKEN = null;
let PUBLIC_TOKEN = null;
let ITEM_ID = null;
let ACCOUNT_ID = null;
let PAYMENT_ID = null;
let AUTHORIZATION_ID = null;
let TRANSFER_ID = null;

const configuration = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
      'Plaid-Version': '2020-09-14',
    },
  },
});

const client = new PlaidApi(configuration);

const plaids = {
    // createLinkToken : async (req, res) => {
    //     const { userId } = req.body;
    //     try {
    //         var user = await User.findById(userId);
    //       const response = await plaidClient.createLinkToken({
    //         user: {
    //           client_user_id: userId,
    //         },
    //         client_name: user.username,
    //         products: ['auth'],
    //         country_codes: ['US'],
    //         language: 'en',
    //       });
    //       res.json(response);
    //     } catch (error) {
    //       res.status(500).json({ error: error.message });
    //     }
    //   },
    createLinkToken: async (req, res) => {
      try{
        var { userid } = req.body
        var user = await User.findById(userid);
        if(!user){
          throw Error("User not found")
        }
        const configs = {
          user: {
            client_user_id: userid,
          },
          client_name: user.username,
          products: PLAID_PRODUCTS,
          country_codes: PLAID_COUNTRY_CODES,
          language: 'en',
        };

        if (PLAID_REDIRECT_URI !== '') {
          configs.redirect_uri = PLAID_REDIRECT_URI;
        }

        if (PLAID_ANDROID_PACKAGE_NAME !== '') {
          configs.android_package_name = PLAID_ANDROID_PACKAGE_NAME;
        }
        if (PLAID_PRODUCTS.includes(Products.Statements)) {
          const statementConfig = {
            end_date: moment().format('YYYY-MM-DD'),
            start_date: moment().subtract(30, 'days').format('YYYY-MM-DD'),
          }
          configs.statements = statementConfig;
        }
        const createTokenResponse = await client.linkTokenCreate(configs);
        res.status(200).json(
          createTokenResponse.data
        )
      }catch (error) {
        res.status(500).json({ error: error.message });
      }
    },
      exchangePublicToken: async (req, res) => {
        const { public_token } = req.body;
        try {
          const tokenResponse = await client.itemPublicTokenExchange({
            public_token,
          });
          ACCESS_TOKEN = tokenResponse.data.access_token;
          ITEM_ID = tokenResponse.data.item_id;
          
          res.status(200).json({
            access_token: ACCESS_TOKEN,
            item_id: ITEM_ID,
            error: null,
          });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
      getAccounts: async (req, res) => {
        const { accessToken } = req.query;
        try {
          const response = await plaidClient.getAccounts(accessToken);
          res.json(response.accounts);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
}

module.exports = plaids

