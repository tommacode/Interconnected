const express = require("express");
const app = express();

//Initialising dotenv
require("dotenv").config();

//Initialising database
const mysql = require("mysql2");

const pool = mysql
  .createPool({
    host: process.env.DB_IP,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  })
  .promise();

//Initialising body parser
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//Initialising cookie parser
const cookieParser = require("cookie-parser");
app.use(cookieParser());

//Initialising ejs
app.set("view engine", "ejs");

//Initialising stripe
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

//Setup Crypto
const crypto = require("crypto");

app.get("/Plans", async (req, res) => {
  const [Plans] = await pool.query(
    "SELECT * FROM Plans WHERE PublicPurchase = 1"
  );
  console.log(Plans);
  res.render(__dirname + "/Pages/EJS/Plans.ejs", { Plans: Plans });
});

app.get("/SignUp", async (req, res) => {
  const [Plans] = await pool.query(
    "SELECT * FROM Plans WHERE PublicPurchase = 1"
  );
  res.render(__dirname + "/Pages/EJS/SignUp.ejs", { Plans: Plans });
});

app.post("/api/SignUp", async (req, res) => {
  console.log(req.body);
  const [User] = await pool.query(
    "SELECT * FROM AdminAccounts WHERE Email = ?",
    [req.body.Email]
  );
  if (User.length > 0) {
    res.send({ Status: "Error", Error: "Email already in use" });
    return;
  }
  const [Plan] = await pool.query("SELECT * FROM Plans WHERE UniqueID = ?", [
    req.body.plan_id,
  ]);
  if (Plan.length == 0) {
    res.send({ Status: "Error", Error: "Plan does not exist" });
    return;
  }
  let Password = crypto
    .createaHash("sha256")
    .update(req.body.Password)
    .digest("hex");
  await pool.query(
    "INSERT INTO AdminAccounts (Email, Password, Plan) VALUES (?, ?, ?)",
    [req.body.Email, Password, Plan[0].ID]
  );
  //Create a session
  //create a random string
  const SessionID = crypto.randomBytes(32).toString("hex");
  //Get the user id
  const [User2] = await pool.query(
    "SELECT * FROM AdminAccounts WHERE Email = ?",
    [req.body.Email]
  );
  //Create an expiration time
  const Expiration = new Date();
  Expiration.setDate(Expiration.getDate() + 1);
  //Insert the session into the database
  await pool.query(
    "INSERT INTO AdminAccountSessions (SessionID, AdminID, Expiration) VALUES (?, ?,?)",
    [SessionID, User2[0].ID, Expiration]
  );
  //Set the cookie
  res.cookie("session_id", SessionID, { expires: Expiration });
  if (Plan[0].Price == 0) {
    // TODO: Make this set the account as paid
    // TODO: Create a flow that allows the user to setup their account (Setup Profile picture, name, etc.)
    res.send({ Status: "Success", RedirectURL: "/Dashboard" });
  } else {
    const Session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: Plan[0].StripePriceID, quantity: 1 }],
      success_url:
        "http://localhost:4000/Success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:4000/Cancel",
    });
    pool.query(
      "INSERT INTO CheckoutSessionAcCountMap (CheckoutSessionID, AccountID) VALUES (?, ?)",
      [Session.id, User2[0].ID]
    );
    res.send({ Status: "Success", RedirectURL: Session.url });
  }
});

app.post("/Checkout", async (req, res) => {
  const Session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: "price_1NKoXYH3dWQ9PXvVYn3fMPm1", quantity: 1 }],
    success_url:
      "http://localhost:3000/Success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "http://localhost:4000/Cancel",
  });

  res.send(Session);
});

app.post(
  "/webhook",
  express.json({ type: "application/json" }),
  async (request, response) => {
    const event = request.body;
    console.log(event);
    // Handle the event
    switch (event.type) {
      case "checkout.session.completed":
        if (event.data.object["payment_status"] != "paid") {
          return;
        }
        const CheckoutSessionID = event.data.object.id;
        const [CheckoutSession] = await pool.query(
          "SELECT * FROM CheckoutSessionAccountMap WHERE CheckoutSessionID = ?",
          [CheckoutSessionID]
        );
        // Get the current date
        let CurrentDate = new Date();
        //Make current date into  datetime format
        CurrentDate = CurrentDate.toISOString().slice(0, 19).replace("T", " ");
        //Update the account to be paid
        await pool.query(
          "UPDATE AdminAccounts SET Paid = 1, BillingDate = ? WHERE ID = ?",
          [CurrentDate, CheckoutSession[0].AccountID]
        );

        break;
      case "payment_method.attached":
        const paymentMethod = event.data.object;
        // Then define and call a method to handle the successful attachment of a PaymentMethod.
        // handlePaymentMethodAttached(paymentMethod);
        break;
      // ... handle other event types
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    // Return a response to acknowledge receipt of the event
    response.json({ received: true });
  }
);

app.listen(4000, () => {
  console.log("http://localhost:4000");
});
