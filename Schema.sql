Create Table AdminAccounts(
    ID int NOT NULL PRIMARY KEY AUTO_INCREMENT,
    Firstname varchar(255) NOT NULL,
    Surname varchar(255) NOT NULL,
    Email varchar(255) NOT NULL,
    Password varchar(255) NOT NULL,
    Plan int NOT NULL DEFAULT 1,
    BillingDate datetime,
    Paid boolean NOT NULL DEFAULT 0,
    Setup boolean NOT NULL DEFAULT 0,
    ProfileImage varchar(255) NOT NULL DEFAULT 'default.png'
);

-- INSERT INTO AdminAccounts (Firstname, Surname, Email, Password, Plan, BillingDate, Paid, Setup) VALUES ('Thomas','Blake', 'tom@tomhasawebsite.com', 'Password', 0, '2021-01-01 00:00:00', 1, 1);

-- NOTE: BillingDate is when the account was last charged
-- If the account isn't paid then redirect to payment page
-- OPtionally add a name and company column to the admin accounts table

Create Table AdminAccountSessions(
    ID int NOT NULL PRIMARY KEY AUTO_INCREMENT,
    AdminID int NOT NULL,
    SessionID varchar(255) NOT NULL,
    Expiration datetime NOT NULL
);

Create Table UserAccounts(
    ID int NOT NULL PRIMARY KEY AUTO_INCREMENT,
    Firstname varchar(255) NOT NULL,
    Surname varchar(255) NOT NULL,
    Email varchar(255) NOT NULL,
    Password varchar(255) NOT NULL,
    ParentID int NOT NULL,
    CreatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    LastLogin datetime,
    `Groups` JSON
);

Create Table UserAccountSessions(
    ID int NOT NULL PRIMARY KEY AUTO_INCREMENT,
    UserID int NOT NULL,
    SessionID varchar(255) NOT NULL,
    Expiration datetime NOT NULL
);


Create Table Plans(
    ID int NOT NULL PRIMARY KEY,
    Name varchar(255) NOT NULL,
    Price decimal(10,2) NOT NULL,
    MaxUsers int NOT NULL,
    MaxGroups int NOT NULL,
    PublicPurchase boolean NOT NULL DEFAULT 0,
    UniqueID varchar(8) NOT NULL,
    StripePriceID varchar(255) NOT NULL
);

Create Table CheckoutSessionAccountMap(
    ID int NOT NULL PRIMARY KEY AUTO_INCREMENT,
    CheckoutSessionID varchar(255) NOT NULL,
    AccountID int NOT NULL
);


-- Plan 0 is the unlimited plan (Admin Only)

CREATE TABLE `Groups`(
    ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(255) NOT NULL,
    ParentID INT NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Members JSON,
    Admins JSON,
    UniqueID VARCHAR(16) NOT NULL,
    Type INT NOT NULL DEFAULT 0
);

Create Table GroupMessages(
    ID int NOT NULL PRIMARY KEY AUTO_INCREMENT,
    SenderID int NOT NULL,
    GroupID int NOT NULL,
    Message text NOT NULL,
    CreatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MessageType int NOT NULL,
    Deleted boolean NOT NULL DEFAULT 0,
    UniqueID varchar(16) NOT NULL,
    MessageData JSON,
    MessageInteractions JSON,
    ReplyingTo int NOT NULL DEFAULT 0
);

