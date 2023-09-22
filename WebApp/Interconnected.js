const express = require("express");
const app = express();
app.disable("x-powered-by");

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

async function FindAccountType(Cookies) {
  //TODO: Check if the session has expired
  const Cookie = Cookies.session_id;

  if (Cookie == undefined || Cookie == null || Cookie == "") {
    console.log("None");
    return "None";
  }
  const [AdminSessions] = await pool.query(
    "SELECT * FROM AdminAccountSessions WHERE SessionID = ?",
    [Cookie]
  );
  //check if the session has expired
  if (AdminSessions.length != 0) {
    console.log("Admin");
    return "Admin";
  }
  const [UserSessions] = await pool.query(
    "SELECT * FROM UserAccountSessions WHERE SessionID = ?",
    [Cookie]
  );
  if (UserSessions.length != 0) {
    console.log("User");
    return "User";
  }
  console.log("None");
  return "None";
}

function PresenceCheck(Variable) {
  return Variable == undefined || Variable == null || Variable == "";
}

app.get("/", async (req, res) => {
  //Optimise this by caching the FindAccountType result
  const AccountType = await FindAccountType(req.cookies);
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
  }
});

// ######
// Admin Pages
// ######

app.get("/ManageUsers", async (req, res) => {
  const AccountType = await FindAccountType(req.cookies);
  if (AccountType == "None" || AccountType == "User") {
    res.redirect("/Login");
    return;
  }
  res.render(__dirname + "/Pages/EJS/Admin/ManageUsers.ejs");
});

app.get("/ManageGroups", async (req, res) => {
  const AccountType = await FindAccountType(req.cookies);
  if (AccountType == "None" || AccountType == "User") {
    res.redirect("/Login");
    return;
  }
  res.render(__dirname + "/Pages/EJS/Admin/ManageGroups.ejs");
});

app.get("/ManagePlans", async (req, res) => {
  const AccountType = await FindAccountType(req.cookies);
  if (AccountType == "None" || AccountType == "User") {
    res.redirect("/Login");
    return;
  }
  res.render(__dirname + "/Pages/EJS/Admin/ManagePlans.ejs");
});

app.get("/Settings", async (req, res) => {
  const AccountType = await FindAccountType(req.cookies);
  if (AccountType == "Admin") {
    res.render(__dirname + "/Pages/EJS/Admin/Settings.ejs");
  }
  if (AccountType == "User") {
    res.render(__dirname + "/Pages/EJS/User/Settings.ejs");
  }
});

// ######
// User Pages
// ######

app.get("/Group/:GroupID", async (req, res) => {
  // TODO: Do something if the group doesn't exist or the user isn't in it
  const AccountType = await FindAccountType(req.cookies);
  if (AccountType == "None" || AccountType == "Admin") {
    res.redirect("/Login");
    return;
  }
  res.render(__dirname + "/Pages/EJS/User/Group.ejs");
});

app.get("/DirectMessages", async (req, res) => {
  const AccountType = await FindAccountType(req.cookies);
  if (AccountType == "None" || AccountType == "Admin") {
    res.redirect("/Login");
    return;
  }
  res.render(__dirname + "/Pages/EJS/User/DirectMessages.ejs");
});

app.get("/DirectMessages/*", async (req, res) => {
  const AccountType = await FindAccountType(req.cookies);
  if (AccountType == "None" || AccountType == "Admin") {
    res.redirect("/Login");
    return;
  }
  res.render(__dirname + "/Pages/EJS/User/DirectMessages.ejs");
});

app.get("/Login", async (req, res) => {
  if ((await FindAccountType(req.cookies)) != "None") {
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
  if (req.body.AdminLogin) {
    console.log("here");
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
    res.send({ success: true });
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
  res.send({ success: true });
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

app.get("/Favicon.ico", async (req, res) => {
  res.sendFile(__dirname + "/Pages/Media/Favicon.ico");
});

//######
//Admin APIs
//######

//GET
app.get("/api/Admin/Accounts", async (req, res) => {
  if ((await FindAccountType(req.cookies)) != "Admin") {
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
  if ((await FindAccountType(req.cookies)) != "Admin") {
    res.sendStatus(404);
    return;
  }
  let ParentID = await pool.query(
    "SELECT AdminID FROM AdminAccountSessions WHERE SessionID = ?",
    [req.cookies.session_id]
  );
  ParentID = ParentID[0][0].AdminID;
  const [Groups] = await pool.query(
    "SELECT Name,CreatedAt,Members,Admins,UniqueID FROM `Groups` WHERE ParentID = ? AND Type = 0",
    [ParentID]
  );
  console.log(Groups);
  for (const Group of Groups) {
    if (Group.Members == null || Group.Members == "" || Group.Members == []) {
      Group.Members = [];
    }
    for (let j = 0; j < Group.Members.length; j++) {
      const [MemberData] = await pool.query(
        "SELECT Firstname,Surname FROM UserAccounts WHERE ID = ?",
        [Group.Members[j]]
      );
      Group.Members[j] = MemberData[0].Firstname + " " + MemberData[0].Surname;
    }
    if (Group.Admins == null || Group.Admins == "" || Group.Admins == []) {
      Group.Admins = [];
    }
    for (let j = 0; j < Group.Admins.length; j++) {
      const [AdminData] = await pool.query(
        "SELECT Name FROM UserAccounts WHERE ID = ?",
        [Groups[i].Admins[j]]
      );
      Group.Admins[j] = AdminData[0].Name;
    }
  }
  res.send(Groups);
});

app.get("/api/Me", async (req, res) => {
  if ((await FindAccountType(req.cookies)) == "None") {
    res.sendStatus(404);
    return;
  }
  if ((await FindAccountType(req.cookies)) == "Admin") {
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
  if ((await FindAccountType(req.cookies)) == "User") {
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
  }
});

//POST
app.post("/api/Admin/CreateAccount", async (req, res) => {
  // TODO: Ban duplicates
  if ((await FindAccountType(req.cookies)) != "Admin") {
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
  if ((await FindAccountType(req.cookies)) != "Admin") {
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
  for (line of CSV) {
    CurrentLine = line.split(",");
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
  if ((await FindAccountType(req.cookies)) != "Admin") {
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
  if ((await FindAccountType(req.cookies)) != "Admin") {
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
    res.send({ error: true });
    return;
  }
  const [UserData] = await pool.query(
    "SELECT * FROM UserAccounts WHERE ID = ? AND ParentID = ?",
    [UserID[0].ID, ParentID[0][0].AdminID]
  );
  if (UserData.length == 0) {
    res.send({ error: true });
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
  if ((await FindAccountType(req.cookies)) != "Admin") {
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
  const AccountType = await FindAccountType(req.cookies);
  if (AccountType == "None") {
    res.sendStatus(404);
    return;
  }
  if (AccountType == "Admin") {
    const [AdminID] = await pool.query(
      "SELECT AdminID FROM AdminAccountSessions WHERE SessionID = ?",
      [req.cookies.session_id]
    );
    for (field of AllowedFields) {
      if (req.body[field] != undefined) {
        if (field == "Password") {
          req.body[field] = crypto
            .createHash("sha256")
            .update(req.body[field])
            .digest("hex");
        }
        await pool.query(
          "UPDATE AdminAccounts SET " + field + " = ? WHERE ID = ?",
          [req.body[field], AdminID[0].AdminID]
        );
      }
    }
    res.sendStatus(200);
  }
});

// ######
// User APIs
// ######

app.get("/api/User/Groups", async (req, res) => {
  if ((await FindAccountType(req.cookies)) != "User") {
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
  let Type;
  console.log(req.query.Type);
  if (req.query.Type == "Group") {
    Type = 0;
  }
  if (req.query.Type == "DM") {
    Type = 1;
  }
  const [Groups] = await pool.query(
    "SELECT Name,CreatedAt,Members,Admins,UniqueID FROM `Groups` WHERE ParentID = ? AND Type = ?",
    [ParentID[0].ParentID, Type]
  );
  // Loop through the groups and check that the user is in them. If not remove them from the array
  console.log(Groups);

  for (let i = 0; i < Groups.length; i++) {
    if (
      Groups[i].Members == null ||
      Groups[i].Members == "" ||
      Groups[i].Members == []
    ) {
      Groups[i].Members = [];
    }
    if (Groups[i].Members.indexOf(UserID) !== -1) {
      continue;
    } else {
      Groups.splice(i, 1);
      i--;
    }
  }
  let CurrentUserIndex;
  if (Type == 1) {
    for (let i = 0; i < Groups.length; i++) {
      CurrentUserIndex = Groups[i].Members.indexOf(UserID);
      let OtherUserID;
      if (CurrentUserIndex == -1) {
        continue;
      }
      if (CurrentUserIndex == 0) {
        OtherUserID = Groups[i].Members[1];
      } else {
        OtherUserID = Groups[i].Members[0];
      }
      const [OtherUserData] = await pool.query(
        "SELECT Firstname,Surname FROM UserAccounts WHERE ID = ?",
        [OtherUserID]
      );
      Groups[i].Name =
        OtherUserData[0].Firstname + " " + OtherUserData[0].Surname;
    }
  }

  for (let i = 0; i < Groups.length; i++) {
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
  if ((await FindAccountType(req.cookies)) != "User") {
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
    res.send({ error: true });
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

app.get("/api/User/Messages/:GroupID", async (req, res) => {
  if ((await FindAccountType(req.cookies)) != "User") {
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
    res.send({ error: true });
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
    "SELECT SenderID,Message,CreatedAt,MessageType,UniqueID,MessageInteractions FROM GroupMessages WHERE GroupID = ? AND Deleted = 0 ORDER BY ID DESC LIMIT 10",
    [GroupData[0].ID]
  );
  // Reverse the array so the newest messages are at the bottom
  Messages.reverse();
  for (message of Messages) {
    const [SenderData] = await pool.query(
      "SELECT Firstname,Surname FROM UserAccounts WHERE ID = ?",
      [message.SenderID]
    );
    // Remove sender ID from the message object
    delete message.SenderID;
    message.Sender = SenderData[0].Firstname + " " + SenderData[0].Surname;
    message.CreatedAt = message.CreatedAt.toLocaleString("en-GB", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    // Specific instructions for each message type

    // #####
    // Question
    // #####
    if (message.MessageType == "Question") {
      try {
        for (let ii = 0; ii < message.MessageInteractions.length; ii++) {
          let [Username] = await pool.query(
            "SELECT Firstname,Surname FROM UserAccounts WHERE ID = ?",
            [message.MessageInteractions[ii].UserID]
          );
          message.MessageInteractions[ii].User =
            Username[0].Firstname + " " + Username[0].Surname;
          delete message.MessageInteractions[ii].UserID;
        }
      } catch (e) {
        console.log(e);
      }
    }
  }
  res.send(Messages);
});

app.get("/api/User/CorporateSpeak", async (req, res) => {
  res.send({ Words: CorporateSpeakGenerator.buzzwords() });
});

app.get("/api/User/SearchUsers/:Search", async (req, res) => {
  // TODO: Return more data like pfp etc
  const AccountType = await FindAccountType(req.cookies);
  if (AccountType != "User" && AccountType != "Admin") {
    res.sendStatus(404);
    return;
  }
  let ParentID;
  if (AccountType == "User") {
    let UserID = await pool.query(
      "SELECT UserID FROM UserAccountSessions WHERE SessionID = ?",
      [req.cookies.session_id]
    );
    UserID = UserID[0][0].UserID;
    [ParentID] = await pool.query(
      "SELECT ParentID FROM UserAccounts WHERE ID = ?",
      [UserID]
    );
    ParentID = ParentID[0].ParentID;
  }
  if (AccountType == "Admin") {
    [ParentID] = await pool.query(
      "SELECT AdminID FROM AdminAccountSessions WHERE SessionID = ?",
      [req.cookies.session_id]
    );
    ParentID = ParentID[0].AdminID;
  }
  console.log(ParentID);
  const [Users] = await pool.query(
    "SELECT Firstname,Surname FROM UserAccounts WHERE ParentID = ? AND CONCAT(Firstname, ' ', Surname) LIKE ? LIMIT 10",
    [ParentID, "%" + req.params.Search + "%"]
  );
  for (let i = 0; i < Users.length; i++) {
    Users[i] = Users[i].Firstname + " " + Users[i].Surname;
  }
  res.send(Users);
});

// Post

app.post("/api/User/SendMessage", async (req, res) => {
  if ((await FindAccountType(req.cookies)) != "User") {
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
  // Create a uniqueID
  const MessageID = crypto.randomBytes(6).toString("hex");
  let MessageType = "1";
  if (
    req.body.MessageType != undefined ||
    req.body.MessageType != null ||
    req.body.MessageType != ""
  ) {
    MessageType = req.body.MessageType;
  }
  // TODO: Add a check to make sure if the messagetype is different that the group type is a group
  await pool.query(
    "INSERT INTO GroupMessages (SenderID, GroupID, Message, MessageType, UniqueID, MessageData, MessageInteractions) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      UserID,
      GroupData[0].ID,
      req.body.Message,
      MessageType,
      MessageID,
      JSON.stringify(req.body.MessageOptions),
      "[]",
    ]
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
    let CurrentTime = new Date();

    Message = {
      Sender: SenderData[0].Firstname + " " + SenderData[0].Surname,
      Message: req.body.Message,
      CreatedAt: CurrentTime.toLocaleString("en-GB", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
      }),
      MessageType: 1,
      UniqueID: MessageID,
      MessageData: req.body.MessageOptions,
      MessageType,
      MessageInteractions: [],
    };
  }
  wss.clients.forEach((ws) => {
    if (ws.ListeningTo == GroupData[0].ID) {
      ws.send(JSON.stringify(Message));
    }
  });
});

app.post("/api/User/MessageInteraction", async (req, res) => {
  if ((await FindAccountType(req.cookies)) != "User") {
    res.sendStatus(404);
    return;
  }
  // Check that all the required pieces of information are present
  if (
    !PresenceCheck(req.body.MessageID) ||
    !PresenceCheck(req.body.MessageType)
  ) {
    res.send("Invalid message");
    return;
  }
  let UserID = await pool.query(
    "SELECT UserID FROM UserAccountSessions WHERE SessionID = ?",
    [req.cookies.session_id]
  );
  UserID = UserID[0][0].UserID;

  if (req.body.MessageType == "Question") {
    if (!PresenceCheck(req.body.Answer)) {
      return;
    }
    // Check the user hasn't already answered the question
    let [MessageData] = await pool.query(
      "SELECT MessageInteractions FROM GroupMessages WHERE UniqueID = ?",
      [req.body.MessageID]
    );

    if (
      MessageData.length === 0 ||
      !MessageData[0].MessageInteractions.length
    ) {
      MessageData = [];
    } else {
      MessageData = MessageData[0].MessageInteractions;
    }

    for (let i = 0; i < MessageData.length; i++) {
      if (MessageData[i].UserID == UserID) {
        res.send({ Success: false, Message: "You have already answered" });
        return;
      }
    }
    let Answer = {
      UserID: UserID,
      Answer: req.body.Answer,
      Time: new Date(),
    };
    console.log(MessageData);
    MessageData.push(Answer);
    await pool.query(
      "UPDATE GroupMessages SET MessageInteractions = ? WHERE UniqueID = ?",
      [JSON.stringify(MessageData), req.body.MessageID]
    );
    res.send({ Success: true });
  }

  if (req.body.MessageType == "Information") {
    // Check the user hasn't already answered the question
    const [MessageData] = await pool.query(
      "SELECT MessageInteractions FROM GroupMessages WHERE UniqueID = ?",
      [req.body.MessageID]
    );
    if (typeof MessageData[0].PositiveInteraction == "undefined") {
      MessageData[0].PositiveInteraction = [];
    }
    let Answered = MessageData[0].PositiveInteraction;
    if (Answered == null || Answered == "" || Answered == []) {
      Answered = [];
    }
    if (Answered.includes(UserID)) {
      res.send("You have already answered this question");
      return;
    }
    Answered.push(UserID);
    await pool.query(
      "UPDATE GroupMessages SET MessageInteractions = ? WHERE UniqueID = ?",
      [
        JSON.stringify({
          PositiveInteraction: Answered,
        }),
        req.body.MessageID,
      ]
    );
    res.send({ Success: true });
  }

  if (req.body.MessageType == "Meeting") {
    // Check the user hasn't already answered the question
    const [MessageData] = await pool.query(
      "SELECT MessageInteractions FROM GroupMessages WHERE UniqueID = ?",
      [req.body.MessageID]
    );
    if (typeof MessageData[0].PositiveInteraction == "undefined") {
      MessageData[0].PositiveInteraction = [];
    }
    if (typeof MessageData[0].NegativeInteraction == "undefined") {
      MessageData[0].NegativeInteraction = [];
    }
    let Answered = MessageData[0].PositiveInteraction;
    let NegativeAnswered = MessageData[0].NegativeInteraction;
    if (Answered == null || Answered == "") {
      Answered = [];
    }
    if (NegativeAnswered == null || NegativeAnswered == "") {
      NegativeAnswered = [];
    }
    if (Answered.includes(UserID) || NegativeAnswered.includes(UserID)) {
      res.send("You have already answered this question");
      return;
    }
    if (req.body.Response == "Accept") {
      Answered.push(UserID);
    }
    if (req.body.Response == "Decline") {
      NegativeAnswered.push(UserID);
    }
    await pool.query(
      "UPDATE GroupMessages SET MessageInteractions = ? WHERE UniqueID = ?",
      [
        JSON.stringify({
          PositiveInteraction: Answered,
          NegativeInteraction: NegativeAnswered,
        }),
        req.body.MessageID,
      ]
    );
    res.send({ Success: true });
  }
});

app.post("/api/User/CreateDirectMessage", async (req, res) => {
  if ((await FindAccountType(req.cookies)) != "User") {
    res.sendStatus(404);
    return;
  }
  let OtherUser = req.body.UserSelected;
  if (OtherUser == "") {
    res.send("Invalid user");
    return;
  }
  // Find the userid of the other user
  let UserID = await pool.query(
    "SELECT ID FROM UserAccounts WHERE CONCAT(Firstname, ' ', Surname) = ?",
    [OtherUser]
  );
  if (UserID[0].length == 0) {
    res.send("Invalid user");
    return;
  }
  OtherUser = UserID[0][0].ID;

  UserID = await pool.query(
    "SELECT UserID FROM UserAccountSessions WHERE SessionID = ?",
    [req.cookies.session_id]
  );
  const CurrentUser = UserID[0][0].UserID;
  console.log(CurrentUser);
  // Create a group type 1 with the two users in it
  const [ParentID] = await pool.query(
    "SELECT ParentID FROM UserAccounts WHERE ID = ?",
    [CurrentUser]
  );
  const GroupID = crypto.randomBytes(6).toString("hex");
  const Members = `[${CurrentUser}, ${OtherUser}]`;
  await pool.query(
    "INSERT INTO `Groups` (Name, ParentID, UniqueID, Members, Type) VALUES (?, ?, ?, ?, ?)",
    ["DM", ParentID[0].ParentID, GroupID, Members, 1]
  );
  res.redirect("/DirectMessages/" + GroupID);
  // TODO: Build in checks for already existing
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
  let AccountType = await FindAccountType(req.cookies);
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
