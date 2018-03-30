/*-----------------------------------------------------------------------------
 * A simple bot for the Microsoft Bot Framework.
 * The bot uses the dialog stack for multi-turn conversation.
 *
 * See getCardMessage for examples involving
 *  - message attachments
 *  - hero cards
 *  - wikijs - getting info from wikipedia
 *
 * See bot.dialog('/weather' for examples involving
 *  - parsing JSON
 *  - making a web request
 *
 * See bot.dialog('/game1' for examples involving
 *  - async
 *  - await
-----------------------------------------------------------------------------*/

// Library to run web server.
var restify = require('restify');
// Libraries to run chat bot.
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");
// The version of node running for the web test does not support async await natively.
// These library implement async await as functions. See: https://www.npmjs.com/package/asyncawait
var async = require('asyncawait/async');
var await = require('asyncawait/await');
// Library for getting info from wikipedia specifically. Uses promises. See: https://www.npmjs.com/package/wikijs
const wiki = require('wikijs').default;
// Library for making simple web requests. See: https://www.npmjs.com/package/request
const request = require('request');

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
        // Send a message to the user.
        session.send("Welcome to 20 questions bot.");
        // Start a new dialog adding this dialog to the stack.
        session.beginDialog('/startgame');
        // The stack is now -> /startgame, /]
    },
    function (session) {
        builder.Prompts.text(session, "Would you like to play again?");
    },
    function (session, result) {
        if (result.response.toUpperCase() === "YES" || result.response.toUpperCase() === "Y") {
            session.replaceDialog('/');
        }
        else {
            session.endConversation("Goodbye");
        }
    }
]);

// Another dialog.
bot.dialog('/startgame', [
    function (session) {
        // Asks the user for a response.
        builder.Prompts.text(session, "Would you like to play a game? ([Y]es/[N]o)");
    },
    function (session, result, next) {
        if (result.response.toUpperCase() === "YES" || result.response.toUpperCase() === "Y") {
            session.send("Let's play 20 questions. Think of a thing. When you are ready.");
            // Adds a new dialog to the stack.
            session.beginDialog('/game1');
            // The stack is now -> /game1, /startgame, /]
        }
        else if (result.response.toUpperCase() == "NO" || result.response.toUpperCase() === "N") {
            session.beginDialog('/weather');
            // The stack is now -> /weather, /startgame, /]
        }
        else {
            session.send("I didn't understand your response.");
            // Replaces the current dialog on the stack.
            // In this case starts the dialog over again.
            session.replaceDialog('/startgame');
            // The stack is now -> /startgame, /]
        }
    },
    function (session) {
        // Ends the current dialog and pops it off the stack.
        // The next dialog on the stack continues where it left off.
        session.endDialog();
        // The stack is now -> /]
        // The dialog will continue at "Would you like to play again?" in "\"
    }
]);

bot.dialog('/game1', [
    function (session) {
        builder.Prompts.text(session, "Is it a cat?");
    },
    // Mark a function async if you want to be able to suspend it with await.
    // Keywords work differently than c# async await.
    (async (function (session, result, next) {
        if (result.response.toUpperCase() === "YES" || result.response.toUpperCase() === "Y") {
            session.send("Hah! I win!");
            // getCardMessage returns a Hero Card https://docs.botframework.com/en-us/node/builder/chat-reference/classes/_botbuilder_d_.herocard.html
            // getCardMessage is asynchronous as it gets information from Wikipedia
            // We await the asynchronous method so it is populated with the info we want and send it to the user.
            var message = await (getCardMessage(session,"Cat"));
            session.send(message);
            // Immediately calls the next function in the dialog
            next();
        }
        else if (result.response.toUpperCase() == "NO" || result.response.toUpperCase() === "N") {
            session.send("Well, I suppose you win then...");
            session.beginDialog('/lose');
        }
        else {
            session.send("I didn't understand your response.");
            session.replaceDialog('/startgame');
        }
    })),
    function (session) {
        session.endDialog();
    }
]);

bot.dialog('/lose', [
    function (session) {
        builder.Prompts.text(session, "What was it you were thinking of? (Please respond with the noun only.)");
    },
    (async (function (session, result) {
        var message = await (getCardMessage(session, result.response));
        // End a dialog with a message.
        session.endDialog(message);
    }))
]);

bot.dialog('/weather', [
    function (session) {
        builder.Prompts.text(session, "In that case how about the weather! Where city do you live in?");
    },
    function (session, result) {
        // Builds a web request to a url. To execute this you need a free API key for OpenWeather
        request(`https://api.openweathermap.org/data/2.5/weather?q=${result.response}&#ApiKeyGoesHere#`, (err, res, body) => {
          if (err) { session.endDialog("Unable to get weather."); return;}
          if (res.statusCode != 200) { session.endDialog("Unable to get weather."); return; }
          // Weather is a JSON object built from the body of the HTTP response.
          var weather = JSON.parse(body);
          // If the response is ok the json will have a response code
          if (weather.cod != 200) { session.endDialog("Unable to get weather."); return; }
          // weather has a json key weather which is an array.
          // weather.weather[0] has a key main which will contain a string which is the weather in that city.
          // {"weather":[{"id":300,"main":"Drizzle","description":"light intensity drizzle","icon":"09d"}], "cod":200}
          // This would send Drizzle
          session.send(weather.weather[0].main.toString());
        });
    }
]);

var getCardMessage = async (function (session, thing){
    // Builds a new message to return to the user.
    var message = new builder.Message(session);
    // Sets the attachment type to be a carousel which displays cards with left and right arrows to browse through
    message.attachmentLayout(builder.AttachmentLayout.carousel);
    // This uses the wikijs library to get info from wikipedia.
    // Gets the main image from wikipedia of the thing you passed to the function ("Cat" or anything else)
    let url = (await (wiki().page(thing).then(page => page.mainImage())));
    // Gets the sumary text from wikipedia of the thing you passed ot the function
    let text = (await (wiki().page(thing).then(page => page.summary())));
    // Builds a new Hero card.
    // .title(thing) sets the title of the card to the string from the user.
    // .text(text) adds the text you got back from wikipedia.
    // .images creates a new CardImage with the url of the image from wikipedia.
    // Attaches the hero card to the message to be returned to the user.
    message.attachments([new builder.HeroCard(session).title(thing).text(text).images([builder.CardImage.create(session, url)])]);
    return message;
});