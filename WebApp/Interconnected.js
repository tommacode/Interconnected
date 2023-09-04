const express = require("express");
const app = express();

//Enable ejs
app.set("view engine", "ejs");

//Enable body-parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//Enable cookie-parser
const cookieParser = require("cookie-parser");
app.use(cookieParser());

//Enable dotenv
require("dotenv").config();

//Enable mysql2
const mysql = require("mysql2");
const pool = mysql
  .createPool({
    host: process.env.DB_IP,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  })
  .promise();

//Crypto
const crypto = require("crypto");

//Enable file upload
const fileUpload = require("express-fileupload");
const { join } = require("path");
app.use(fileUpload());

//Enable CorporateSpeakGenerator
const CorporateSpeakGenerator = require("./CorporateSpeakGenerator/Words.js");

// Websockets
const ws = require("ws");

const wss = new ws.Server({ port: 3001 });

wss.on("connection", (ws) => {
  ws.dead = true;
  ws.Account = null;
  ws.ListeningTo = null;
  ws.on("message", async (message) => {
    if (!ws.dead) {
      return;
    }
    console.log(message.toString());
    const Message = JSON.parse(message.toString());
    // Find account and authenticate
    const [AccountID] = await pool.query(
      "SELECT UserID FROM UserAccountSessions WHERE SessionID = ?",
      [Message["session_id"]]
    );
    if (AccountID.length == 0) {
      ws.send(JSON.stringify({ error: "Invalid session ID" }));
      ws.close();
      return;
    }
    ws.Account = AccountID[0].UserID;
    // Listen to the group
    const [GroupInfo] = await pool.query(
      "SELECT * FROM `Groups` WHERE UniqueID = ?",
      [Message["GroupID"]]
    );
    if (GroupInfo.length == 0) {
      ws.send(JSON.stringify({ error: "Invalid Group ID" }));
      ws.close();
      return;
    }
    console.log(GroupInfo[0].Members);
    console.log(ws.Account);
    if (GroupInfo[0].Members.indexOf(ws.Account) == -1) {
      ws.send(JSON.stringify({ error: "You are not in this group" }));
      ws.close();
      return;
    }
    ws.ListeningTo = GroupInfo[0].ID;
    ws.dead = false;
  });
});

async function FindAccountType(Cookie) {
  //TODO: Check if the session has expired
  if (Cookie == undefined || Cookie == null || Cookie == "") {
    return "None";
  }
  const [AdminSessions] = await pool.query(
    "SELECT * FROM AdminAccountSessions WHERE SessionID = ?",
    [Cookie]
  );
  //check if the session has expired
  if (AdminSessions.length != 0) {
    return "Admin";
  }
  const [UserSessions] = await pool.query(
    "SELECT * FROM UserAccountSessions WHERE SessionID = ?",
    [Cookie]
  );
  if (UserSessions.length != 0) {
    return "User";
  }

  return "None";
}

app.get("/", async (req, res) => {
  //Optimise this by caching the FindAccountType result
  const AccountType = await FindAccountType(req.cookies.session_id);
  if (AccountType == "None") {
    res.redirect("/Login");
    return;
  }
  if (AccountType == "Admin") {
    const SessionID = req.cookies.session_id;
    const [AdminID] = await pool.query(
      "SELECT AdminID FROM AdminAccountSessions WHERE SessionID = ?",
      [SessionID]
    );
    const [AccountData] = await pool.query(
      "SELECT * FROM AdminAccounts WHERE ID = ?",
      [AdminID[0].AdminID]
    );
    let [PlanData] = await pool.query("SELECT * FROM Plans WHERE ID = ?", [
      AccountData[0].Plan,
    ]);
    PlanData = PlanData[0];
    let [UserCount] = await pool.query(
      "SELECT COUNT(*) FROM UserAccounts WHERE ParentID = ?",
      [AdminID[0].AdminID]
    );
    UserCount = UserCount[0]["COUNT(*)"];
    let [GroupCount] = await pool.query(
      "SELECT COUNT(*) FROM `Groups` WHERE ParentID = ?",
      [AdminID[0].AdminID]
    );
    GroupCount = GroupCount[0]["COUNT(*)"];
    console.log(AccountData);
    res.render(__dirname + "/Pages/EJS/Admin/AdminHome.ejs", {
      Admin: AccountData[0],
      Plan: PlanData,
      UserCount: UserCount,
      GroupCount: GroupCount,
    });
    return;
  }
  if (AccountType == "User") {
    res.render(__dirname + "/Pages/EJS/User/UserHome.ejs");
    return;
  }
});

// ######
// Admin Pages
// ######

app.get("/ManageUsers", async (req, res) => {
  const AccountType = await FindAccountType(req.cookies.session_id);
  if (AccountType == "None" || AccountType == "User") {
    res.redirect("/Login");
    return;
  }
  res.render(__dirname + "/Pages/EJS/Admin/ManageUsers.ejs");
});

app.get("/ManageGroups", async (req, res) => {
  const AccountType = await FindAccountType(req.cookies.session_id);
  if (AccountType == "None" || AccountType == "User") {
    res.redirect("/Login");
    return;
  }
  res.render(__dirname + "/Pages/EJS/Admin/ManageGroups.ejs");
});

app.get("/ManagePlans", async (req, res) => {
  const AccountType = await FindAccountType(req.cookies.session_id);
  if (AccountType == "None" || AccountType == "User") {
    res.redirect("/Login");
    return;
  }
  res.render(__dirname + "/Pages/EJS/Admin/ManagePlans.ejs");
});

app.get("/Settings", async (req, res) => {
  const AccountType = await FindAccountType(req.cookies.session_id);
  if (AccountType == "Admin") {
    res.render(__dirname + "/Pages/EJS/Admin/Settings.ejs");
  }
});

// ######
// User Pages
// ######

app.get("/Group/:GroupID", async (req, res) => {
  const AccountType = await FindAccountType(req.cookies.session_id);
  if (AccountType == "None" || AccountType == "Admin") {
    res.redirect("/Login");
    return;
  }
  res.render(__dirname + "/Pages/EJS/User/Group.ejs");
});

app.get("/DirectMessages", async (req, res) => {
  const AccountType = await FindAccountType(req.cookies.session_id);
  if (AccountType == "None" || AccountType == "Admin") {
    res.redirect("/Login");
    return;
  }
  res.render(__dirname + "/Pages/EJS/User/DirectMessages.ejs");
});

app.get("/Login", async (req, res) => {
  if ((await FindAccountType(req.cookies.session_id)) != "None") {
    res.redirect("/");
    return;
  }
  res.render(__dirname + "/Pages/EJS/All/Login.ejs");
});

app.post("/api/Login", async (req, res) => {
  // TODO: Make logins use email and password not username
  console.log(req.body);
  let Email = req.body.Email;
  let Password = crypto
    .createHash("sha256")
    .update(req.body.Password)
    .digest("hex");
  if (req.body.AdminLogin == "on") {
    const [AccountID] = await pool.query(
      "SELECT * FROM AdminAccounts WHERE Email = ? AND Password = ?",
      [Email, Password]
    );
    console.log(AccountID);
    if (AccountID.length == 0) {
      res.send({ error: "Invalid email address or password" });
      return;
    }
    let SessionID = crypto.randomBytes(64).toString("hex");
    //Create a datime object for 24 hours from now
    let SessionExpiry = new Date();
    SessionExpiry.setHours(SessionExpiry.getHours() + 24);
    await pool.query(
      "INSERT INTO AdminAccountSessions (AdminID, SessionID, Expiration) VALUES (?, ?,?)",
      [AccountID[0].ID, SessionID, SessionExpiry]
    );
    res.cookie("session_id", SessionID);
    res.redirect("/");
    return;
  }
  //Assumes user login
  const [AccountID] = await pool.query(
    "SELECT * FROM UserAccounts WHERE Email = ? AND Password = ?",
    [Email, Password]
  );
  if (AccountID.length == 0) {
    res.send({ error: "Invalid username or password" });
    return;
  }
  let SessionID = crypto.randomBytes(64).toString("hex");
  let SessionExpiry = new Date();
  SessionExpiry.setHours(SessionExpiry.getHours() + 24);
  await pool.query(
    "INSERT INTO UserAccountSessions (UserID, SessionID, Expiration) VALUES (?, ?,?)",
    [AccountID[0].ID, SessionID, SessionExpiry]
  );
  res.cookie("session_id", SessionID);
  res.redirect("/");
  return;
});

app.get("/CSS/:File", async (req, res) => {
  const File = req.params.File;
  res.sendFile(__dirname + "/Pages/CSS/" + File);
});

app.get("/JS/:File", async (req, res) => {
  const File = req.params.File;
  res.sendFile(__dirname + "/Pages/JS/" + File);
});

app.get("/ProfileImages/:File", async (req, res) => {
  const File = req.params.File;
  res.sendFile(__dirname + "/Pages//Media/ProfileImages/" + File);
});

//######
//Admin APIs
//######

//GET
app.get("/api/Admin/Accounts", async (req, res) => {
  if ((await FindAccountType(req.cookies.session_id)) != "Admin") {
    res.sendStatus(404);
    return;
  }
  let ParentID = await pool.query(
    "SELECT AdminID FROM AdminAccountSessions WHERE SessionID = ?",
    [req.cookies.session_id]
  );
  ParentID = ParentID[0][0].AdminID;
  const [Accounts] = await pool.query(
    "SELECT Firstname,Surname,Email FROM UserAccounts WHERE ParentID = ? ORDER BY Surname ASC",
    [ParentID]
  );
  res.send(Accounts);
});

app.get("/api/Admin/Groups", async (req, res) => {
  if ((await FindAccountType(req.cookies.session_id)) != "Admin") {
    res.sendStatus(404);
    return;
  }
  let ParentID = await pool.query(
    "SELECT AdminID FROM AdminAccountSessions WHERE SessionID = ?",
    [req.cookies.session_id]
  );
  ParentID = ParentID[0][0].AdminID;
  const [Groups] = await pool.query(
    "SELECT Name,CreatedAt,Members,Admins,UniqueID FROM `Groups` WHERE ParentID = ?",
    [ParentID]
  );
  console.log(Groups);
  for (let i = 0; i < Groups.length; i++) {
    if (
      Groups[i].Members == null ||
      Groups[i].Members == "" ||
      Groups[i].Members == []
    ) {
      Groups[i].Members = [];
    }
    for (let j = 0; j < Groups[i].Members.length; j++) {
      const [MemberData] = await pool.query(
        "SELECT Firstname,Surname FROM UserAccounts WHERE ID = ?",
        [Groups[i].Members[j]]
      );
      Groups[i].Members[j] =
        MemberData[0].Firstname + " " + MemberData[0].Surname;
    }
    if (
      Groups[i].Admins == null ||
      Groups[i].Admins == "" ||
      Groups[i].Admins == []
    ) {
      Groups[i].Admins = [];
    }
    for (let j = 0; j < Groups[i].Admins.length; j++) {
      const [AdminData] = await pool.query(
        "SELECT Name FROM UserAccounts WHERE ID = ?",
        [Groups[i].Admins[j]]
      );
      Groups[i].Admins[j] = AdminData[0].Name;
    }
  }
  res.send(Groups);
});

app.get("/api/Me", async (req, res) => {
  if ((await FindAccountType(req.cookies.session_id)) == "None") {
    res.sendStatus(404);
    return;
  }
  if ((await FindAccountType(req.cookies.session_id)) == "Admin") {
    let ParentID = await pool.query(
      "SELECT AdminID FROM AdminAccountSessions WHERE SessionID = ?",
      [req.cookies.session_id]
    );
    ParentID = ParentID[0][0].AdminID;
    let [Account] = await pool.query(
      "SELECT Firstname,Surname,Email,Plan,ProfileImage FROM AdminAccounts WHERE ID = ?",
      [ParentID]
    );
    const [PlanName] = await pool.query("SELECT Name FROM Plans WHERE ID = ?", [
      Account[0].Plan,
    ]);
    Account[0].Plan = PlanName[0].Name;
    res.send(Account[0]);
    return;
  }
  if ((await FindAccountType(req.cookies.session_id)) == "User") {
    let UserID = await pool.query(
      "SELECT UserID FROM UserAccountSessions WHERE SessionID = ?",
      [req.cookies.session_id]
    );
    UserID = UserID[0][0].UserID;
    const [Account] = await pool.query(
      "SELECT * FROM UserAccounts WHERE ID = ?",
      [UserID]
    );
    res.send(Account[0]);
    return;
  }
});

//POST
app.post("/api/Admin/CreateAccount", async (req, res) => {
  // TODO: Ban duplicates
  if ((await FindAccountType(req.cookies.session_id)) != "Admin") {
    console.log("Not admin");
    res.sendStatus(404);
    return;
  }
  console.log(req.body);
  const Firstname = req.body.Firstname;
  const Surname = req.body.Surname;
  const Email = req.body.Email;
  const Password = crypto
    .createHash("sha256")
    .update(req.body.Password)
    .digest("hex");
  const ParentID = await pool.query(
    "SELECT AdminID FROM AdminAccountSessions WHERE SessionID = ?",
    [req.cookies.session_id]
  );
  await pool.query(
    "INSERT INTO UserAccounts (Firstname, Surname, Email, Password, ParentID) VALUES (?, ?, ?, ?, ?)",
    [Firstname, Surname, Email, Password, ParentID[0][0].AdminID]
  );
  res.redirect("/ManageUsers");
});

app.post("/api/Admin/CreateMultipleUsers", async (req, res) => {
  // TODO: Ban duplicates
  //Check that the user is an admin
  if ((await FindAccountType(req.cookies.session_id)) != "Admin") {
    res.sendStatus(404);
    return;
  }
  console.log(req.files);
  console.log(req.body);
  //Check the file is a csv
  if (req.files == null) {
    res.send("No file uploaded");
    return;
  }
  if (req.files.Users.mimetype != "text/csv") {
    res.send("Invalid file type");
    return;
  }
  //Read the file
  let CSV = req.files.Users.data.toString();
  CSV = CSV.split("\n");
  for (let i = 0; i < CSV.length - 1; i++) {
    //remove the last two characters from each line
    CSV[i] = CSV[i].substring(0, CSV[i].length - 1);
  }
  // console.log(CSV[0])
  // if (CSV[0] != "Name,Email,Password") {
  //     res.send("Invalid CSV format. Please refer to the example CSV file or contact support");
  //     return
  // }
  //Remove the first line
  CSV.shift();
  //Create the users
  for (let i = 0; i < CSV.length; i++) {
    CurrentLine = CSV[i].split(",");
    if (CurrentLine.length != 4) {
      console.log(
        "Invalid CSV format. Please refer to the example CSV file or contact support"
      );
      continue;
    }
    const Firstname = CurrentLine[0];
    const Surname = CurrentLine[1];
    const Email = CurrentLine[2];
    const Password = crypto
      .createHash("sha256")
      .update(CurrentLine[3])
      .digest("hex");
    const ParentID = await pool.query(
      "SELECT AdminID FROM AdminAccountSessions WHERE SessionID = ?",
      [req.cookies.session_id]
    );
    await pool.query(
      "INSERT INTO UserAccounts (Firstname, Surname, Email, Password, ParentID) VALUES (?, ?, ?, ?, ?)",
      [Firstname, Surname, Email, Password, ParentID[0][0].AdminID]
    );
  }
  res.redirect("/");
});

app.post("/api/Admin/CreateGroup", async (req, res) => {
  if ((await FindAccountType(req.cookies.session_id)) != "Admin") {
    res.sendStatus(404);
    return;
  }
  const Name = req.body.GroupName;
  const ParentID = await pool.query(
    "SELECT AdminID FROM AdminAccountSessions WHERE SessionID = ?",
    [req.cookies.session_id]
  );
  // Make a random string of 16
  const GroupID = crypto.randomBytes(6).toString("hex");
  await pool.query(
    "INSERT INTO `Groups` (Name, ParentID, UniqueID) VALUES (?, ?, ?)",
    [Name, ParentID[0][0].AdminID, GroupID]
  );
  res.redirect("/ManageGroups");
});

app.post("/api/Admin/AddUserToGroup", async (req, res) => {
  if ((await FindAccountType(req.cookies.session_id)) != "Admin") {
    res.sendStatus(404);
    return;
  }
  const GroupID = req.body.GroupID;
  const [UserID] = await pool.query(
    "SELECT ID FROM UserAccounts WHERE CONCAT(Firstname, ' ', Surname) = ?",
    [req.body.Name]
  );

  const ParentID = await pool.query(
    "SELECT AdminID FROM AdminAccountSessions WHERE SessionID = ?",
    [req.cookies.session_id]
  );
  const [GroupData] = await pool.query(
    "SELECT * FROM `Groups` WHERE UniqueID = ? AND ParentID = ?",
    [GroupID, ParentID[0][0].AdminID]
  );
  if (GroupData.length == 0) {
    res.send("Invalid Group ID");
    return;
  }
  const [UserData] = await pool.query(
    "SELECT * FROM UserAccounts WHERE ID = ? AND ParentID = ?",
    [UserID[0].ID, ParentID[0][0].AdminID]
  );
  if (UserData.length == 0) {
    res.send("Invalid User ID");
    return;
  }
  let Members = GroupData[0].Members;
  if (Members == null || Members == "" || Members == []) {
    Members = [];
  }
  // If members is an int convert it to an array
  if (typeof Members == "number") {
    Members = [Members];
  }
  if (Members.includes(UserID[0].ID)) {
    res.send("User already in group");
    return;
  }

  Members.push(UserID[0].ID);
  Members = Members.join(",");
  if (typeof Members == "string") {
    // Put [] around the string
    Members = "[" + Members + "]";
  }
  await pool.query("UPDATE `Groups` SET Members = ? WHERE UniqueID = ?", [
    Members,
    GroupID,
  ]);
  res.redirect("/ManageGroups");
});

app.post("/api/Admin/DeleteGroup", async (req, res) => {
  if ((await FindAccountType(req.cookies.session_id)) != "Admin") {
    res.sendStatus(404);
    return;
  }
  const GroupID = req.body.GroupID;
  const ParentID = await pool.query(
    "SELECT AdminID FROM AdminAccountSessions WHERE SessionID = ?",
    [req.cookies.session_id]
  );
  console.log(req.body);
  await pool.query("DELETE FROM `Groups` WHERE UniqueID = ? AND ParentID = ?", [
    GroupID,
    ParentID[0][0].AdminID,
  ]);
  res.redirect("/ManageGroups");
});

// ######
// Admin Settings
// ######

app.put("/api/Me", async (req, res) => {
  const AllowedFields = ["Firstname", "Surname", "Email", "Password"];
  const AccountType = await FindAccountType(req.cookies.session_id);
  if (AccountType == "None") {
    res.sendStatus(404);
    return;
  }
  if (AccountType == "Admin") {
    const [AdminID] = await pool.query(
      "SELECT AdminID FROM AdminAccountSessions WHERE SessionID = ?",
      [req.cookies.session_id]
    );
    const [AccountData] = await pool.query(
      "SELECT * FROM AdminAccounts WHERE ID = ?",
      [AdminID[0].AdminID]
    );
    for (let i = 0; i < AllowedFields.length; i++) {
      if (req.body[AllowedFields[i]] != undefined) {
        if (AllowedFields[i] == "Password") {
          req.body[AllowedFields[i]] = crypto
            .createHash("sha256")
            .update(req.body[AllowedFields[i]])
            .digest("hex");
        }
        await pool.query(
          "UPDATE AdminAccounts SET " + AllowedFields[i] + " = ? WHERE ID = ?",
          [req.body[AllowedFields[i]], AdminID[0].AdminID]
        );
      }
    }
    res.sendStatus(200);
    return;
  }
});

// ######
// User APIs
// ######

app.get("/api/User/Groups", async (req, res) => {
  if ((await FindAccountType(req.cookies.session_id)) != "User") {
    res.sendStatus(404);
    return;
  }
  let UserID = await pool.query(
    "SELECT UserID FROM UserAccountSessions WHERE SessionID = ?",
    [req.cookies.session_id]
  );
  UserID = UserID[0][0].UserID;
  const [ParentID] = await pool.query(
    "SELECT ParentID FROM UserAccounts WHERE ID = ?",
    [UserID]
  );
  const [Groups] = await pool.query(
    "SELECT Name,CreatedAt,Members,Admins,UniqueID FROM `Groups` WHERE ParentID = ?",
    [ParentID[0].ParentID]
  );
  // Loop through the groups and check that the user is in them. If not remove them from the array
  console.log(Groups);
  for (let i = 0; i < Groups.length; i++) {
    if (Groups[i].Members.indexOf(UserID) !== -1) {
      continue;
    } else {
      Groups.splice(i, 1);
      i--;
    }
  }

  for (let i = 0; i < Groups.length; i++) {
    if (
      Groups[i].Members == null ||
      Groups[i].Members == "" ||
      Groups[i].Members == []
    ) {
      Groups[i].Members = [];
    }
    for (let j = 0; j < Groups[i].Members.length; j++) {
      const [MemberData] = await pool.query(
        "SELECT Firstname,Surname FROM UserAccounts WHERE ID = ?",
        [Groups[i].Members[j]]
      );
      Groups[i].Members[j] =
        MemberData[0].Firstname + " " + MemberData[0].Surname;
    }
    if (
      Groups[i].Admins == null ||
      Groups[i].Admins == "" ||
      Groups[i].Admins == []
    ) {
      Groups[i].Admins = [];
    }
    for (let j = 0; j < Groups[i].Admins.length; j++) {
      const [AdminData] = await pool.query(
        "SELECT Name FROM UserAccounts WHERE ID = ?",
        [Groups[i].Admins[j]]
      );
      Groups[i].Admins[j] = AdminData[0].Name;
    }
  }
  res.send(Groups);
});

app.get("/api/User/Group/:GroupID", async (req, res) => {
  if ((await FindAccountType(req.cookies.session_id)) != "User") {
    res.sendStatus(404);
    return;
  }
  let UserID = await pool.query(
    "SELECT UserID FROM UserAccountSessions WHERE SessionID = ?",
    [req.cookies.session_id]
  );
  UserID = UserID[0][0].UserID;
  const [ParentID] = await pool.query(
    "SELECT ParentID FROM UserAccounts WHERE ID = ?",
    [UserID]
  );
  const [GroupData] = await pool.query(
    "SELECT * FROM `Groups` WHERE UniqueID = ? AND ParentID = ?",
    [req.params.GroupID, ParentID[0].ParentID]
  );
  if (GroupData.length == 0) {
    res.send("Invalid Group ID");
    return;
  }
  if (
    GroupData[0].Members == null ||
    GroupData[0].Members == "" ||
    GroupData[0].Members == []
  ) {
    GroupData[0].Members = [];
  }
  for (let j = 0; j < GroupData[0].Members.length; j++) {
    const [MemberData] = await pool.query(
      "SELECT Firstname,Surname FROM UserAccounts WHERE ID = ?",
      [GroupData[0].Members[j]]
    );
    GroupData[0].Members[j] =
      MemberData[0].Firstname + " " + MemberData[0].Surname;
  }
  if (
    GroupData[0].Admins == null ||
    GroupData[0].Admins == "" ||
    GroupData[0].Admins == []
  ) {
    GroupData[0].Admins = [];
  }
  for (let j = 0; j < GroupData[0].Admins.length; j++) {
    const [AdminData] = await pool.query(
      "SELECT Name FROM UserAccounts WHERE ID = ?",
      [GroupData[0].Admins[j]]
    );
    GroupData[0].Admins[j] = AdminData[0].Name;
  }
  res.send(GroupData[0]);
});

app.get("/api/User/Group/Messages/:GroupID", async (req, res) => {
  if ((await FindAccountType(req.cookies.session_id)) != "User") {
    res.sendStatus(404);
    return;
  }
  let UserID = await pool.query(
    "SELECT UserID FROM UserAccountSessions WHERE SessionID = ?",
    [req.cookies.session_id]
  );
  UserID = UserID[0][0].UserID;
  const [ParentID] = await pool.query(
    "SELECT ParentID FROM UserAccounts WHERE ID = ?",
    [UserID]
  );
  const [GroupData] = await pool.query(
    "SELECT * FROM `Groups` WHERE UniqueID = ? AND ParentID = ?",
    [req.params.GroupID, ParentID[0].ParentID]
  );
  if (GroupData.length == 0) {
    res.send("Invalid Group ID");
    return;
  }
  if (
    GroupData[0].Members == null ||
    GroupData[0].Members == "" ||
    GroupData[0].Members == []
  ) {
    GroupData[0].Members = [];
  }
  if (!GroupData[0].Members.includes(UserID)) {
    res.send("You are not in this group");
    return;
  }
  const [Messages] = await pool.query(
    "SELECT SenderID,Message,CreatedAt,MessageType FROM GroupMessages WHERE GroupID = ? AND Deleted = 0 ORDER BY ID ASC LIMIT 50",
    [GroupData[0].ID]
  );
  for (let i = 0; i < Messages.length; i++) {
    const [SenderData] = await pool.query(
      "SELECT Firstname,Surname FROM UserAccounts WHERE ID = ?",
      [Messages[i].SenderID]
    );
    // Remove sender ID from the message object
    delete Messages[i].SenderID;
    Messages[i].Sender = SenderData[0].Firstname + " " + SenderData[0].Surname;
    Messages[i].CreatedAt = Messages[i].CreatedAt.toLocaleString("en-GB", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  }
  res.send(Messages);
});

app.get("/api/User/CorporateSpeak", async (req, res) => {
  res.send({ Words: CorporateSpeakGenerator.buzzwords() });
});

app.post("/api/User/Group/SendMessage", async (req, res) => {
  if ((await FindAccountType(req.cookies.session_id)) != "User") {
    res.sendStatus(404);
    return;
  }
  if (req.body.Message == "") {
    res.send("Invalid message");
    return;
  }
  let UserID = await pool.query(
    "SELECT UserID FROM UserAccountSessions WHERE SessionID = ?",
    [req.cookies.session_id]
  );
  UserID = UserID[0][0].UserID;
  const [ParentID] = await pool.query(
    "SELECT ParentID FROM UserAccounts WHERE ID = ?",
    [UserID]
  );
  const [GroupData] = await pool.query(
    "SELECT * FROM `Groups` WHERE UniqueID = ? AND ParentID = ?",
    [req.body.GroupID, ParentID[0].ParentID]
  );
  if (GroupData.length == 0) {
    res.send("Invalid Group ID");
    return;
  }
  if (
    GroupData[0].Members == null ||
    GroupData[0].Members == "" ||
    GroupData[0].Members == []
  ) {
    GroupData[0].Members = [];
  }
  if (!GroupData[0].Members.includes(UserID)) {
    res.send("You are not in this group");
    return;
  }
  await pool.query(
    "INSERT INTO GroupMessages (SenderID, GroupID, Message, MessageType) VALUES (?, ?, ?, ?)",
    [UserID, GroupData[0].ID, req.body.Message, 1]
  );
  res.send({ Success: true });
  // Send it out to the websockets
  let Message;
  if (wss.clients.size != 0) {
    // Render and object with the message and the username etc
    const [SenderData] = await pool.query(
      "SELECT Firstname,Surname FROM UserAccounts WHERE ID = ?",
      [UserID]
    );
    const [MessageMetadata] = await pool.query(
      "SELECT ID,CreatedAt FROM GroupMessages WHERE SenderID = ? AND GroupID = ? AND Message = ? AND MessageType = ?",
      [UserID, GroupData[0].ID, req.body.Message, 1]
    );
    Message = {
      Sender: SenderData[0].Firstname + " " + SenderData[0].Surname,
      Message: req.body.Message,
      CreatedAt: MessageMetadata[0].CreatedAt.toLocaleString("en-GB", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
      }),
      MessageType: 1,
    };
  }
  wss.clients.forEach((ws) => {
    if (ws.ListeningTo == GroupData[0].ID) {
      ws.send(JSON.stringify(Message));
    }
  });
});

//######
//Account Setup Flows
//######

//GET
app.get("/Success", async (req, res) => {
  const [AccountID] = await pool.query(
    "SELECT * FROM CheckoutSessionAccountMap WHERE CheckoutSessionID = ?",
    [req.query.session_id]
  );
  if (AccountID.length == 0) {
    res.send("Error");
    return;
  }
  let SessionID = crypto.randomBytes(64).toString("hex");
  //Create a datime object for 24 hours from now
  let SessionExpiry = new Date();
  SessionExpiry.setHours(SessionExpiry.getHours() + 24);
  await pool.query(
    "INSERT INTO AdminAccountSessions (AdminID, SessionID, Expiration) VALUES (?, ?,?)",
    [AccountID[0].ID, SessionID, SessionExpiry]
  );
  res.cookie("session_id", SessionID);
  res.render(__dirname + "/Pages/EJS/Admin/Success.ejs", {
    SessionID: req.query["session_id"],
  });
});

app.get("/api/subscription/status/:SessionID", async (req, res) => {
  let AccountType = await FindAccountType(req.cookies.session_id);
  if (AccountType == "User" || AccountType == "None") {
    res.send("Error");
    return;
  }

  //Here the account type is admin only)
  let ParentID = await pool.query(
    "SELECT AccountID FROM CheckoutSessionAccountMap WHERE CheckoutSessionID = ?",
    [req.params.SessionID]
  );
  ParentID = ParentID[0][0].AccountID;
  console.log(ParentID);
  let SubscriptionStatus = await pool.query(
    "SELECT ID,Plan,BillingDate,Paid FROM AdminAccounts WHERE ID = ?",
    [ParentID]
  );
  SubscriptionStatus = SubscriptionStatus[0][0];
  res.send(SubscriptionStatus);
});

app.listen(3000, () => {
  console.log("http://localhost:3000");
});
