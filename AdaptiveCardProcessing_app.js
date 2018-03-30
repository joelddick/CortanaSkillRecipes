/*-----------------------------------------------------------------------------
 * A simple adaptive card processing bot for the Microsoft Bot Framework.
-----------------------------------------------------------------------------*/

// Library to run web server.
var restify = require('restify');
// Libraries to run chat bot.
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});
  
// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot. 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector);
bot.set('storage', tableStorage);

// Start the root dialog ("/"). This adds the first dialog to the stack.
bot.dialog('/', [
    function (session) {
        if (session.message && session.message.value) {
            // A Card's Submit Action obj was received
            processSubmitAction(session, session.message.value);
            return;
        }
        
        var msg = new builder.Message(session);
        msg.addAttachment({
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
              "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
              "type": "AdaptiveCard",
              "version": "1.0",
              "body": [
                {
                  "type": "ColumnSet",
                  "columns": [
                    {
                      "type": "Column",
                      "width": 2,
                      "items": [
                        {
                          "type": "TextBlock",
                          "text": "Tell us about yourself",
                          "weight": "bolder",
                          "size": "medium"
                        },
                        {
                          "type": "TextBlock",
                          "text": "We just need a few more details to get you booked for the trip of a lifetime!",
                          "isSubtle": true,
                          "wrap": true
                        },
                        {
                          "type": "TextBlock",
                          "text": "Don't worry, we'll never share or sell your information.",
                          "isSubtle": true,
                          "wrap": true,
                          "size": "small"
                        },
                        {
                          "type": "TextBlock",
                          "text": "Your name",
                          "wrap": true
                        },
                        {
                          "type": "Input.Text",
                          "id": "myName",
                          "placeholder": "Last, First"
                        },
                        {
                          "type": "TextBlock",
                          "text": "Your email",
                          "wrap": true
                        },
                        {
                          "type": "Input.Text",
                          "id": "myEmail",
                          "placeholder": "youremail@example.com",
                          "style": "email"
                        },
                        {
                          "type": "TextBlock",
                          "text": "Phone Number"
                        },
                        {
                          "type": "Input.Text",
                          "id": "myTel",
                          "placeholder": "xxx.xxx.xxxx",
                          "style": "tel"
                        }
                      ]
                    }
                  ]
                }
              ],
              "actions": [
                {
                  "type": "Action.Submit",
                  "title": "Submit"
                }
              ]
            }
        });
        session.send(msg);
    }
]);

function processSubmitAction(session, value) {
    //value is an object: { myName: 'Value1', myEmail: 'Value2', myTel: 'Value3' }
    session.send(`Name: ${value.myName}`);
    session.send(`Email: ${value.myEmail}`);
    session.send(`Telephone: ${value.myTel}`);
}