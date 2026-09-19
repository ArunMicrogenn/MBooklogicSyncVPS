-- PostgreSQL Database Schema for BookLogic PMS/OTA Sync
-- Target Database: BOOKLOGIC
-- Host: 72.61.240.34
-- Port: 5432

-- 1. Hotels master table
CREATE TABLE IF NOT EXISTS "Mas_Hotel" (
    "HotelCode" VARCHAR(100) PRIMARY KEY,
    "Username" VARCHAR(255) NOT NULL,
    "Password" VARCHAR(255) NOT NULL,
    "Inactive" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Reservations Primary Table
CREATE TABLE IF NOT EXISTS "Reservations" (
    "Res_id" SERIAL PRIMARY KEY,
    "Hotel_Code" VARCHAR(100),
    "Booking_Id" VARCHAR(100),
    "syncType" VARCHAR(50),
    "PnrID" VARCHAR(100),
    "ExternalReference" VARCHAR(255),
    "ExternalReservationRoomId" VARCHAR(100),
    "ExternalReservationId" VARCHAR(100),
    "deposit" VARCHAR(100),
    "Service" VARCHAR(255),
    "TravelagentName" VARCHAR(255),
    "UpdateDate" VARCHAR(100),
    "modifyDate" VARCHAR(100),
    "cancelDate" VARCHAR(100),
    "Currency" VARCHAR(20),
    "Status" VARCHAR(50),
    "Adult" VARCHAR(20),
    "ChildB" VARCHAR(20),
    "ChildA" VARCHAR(20),
    "Infant" VARCHAR(20),
    "Remarks" TEXT,
    "Insertdate" VARCHAR(100),
    "MarkSend" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index on Booking_Id and syncType for fast duplicate checking
CREATE INDEX IF NOT EXISTS idx_reservations_booking_sync ON "Reservations" ("Booking_Id", "syncType");
CREATE INDEX IF NOT EXISTS idx_reservations_marksend ON "Reservations" ("MarkSend", "Hotel_Code");

-- 3. Reservations Details (Rooms, Rates, Taxes)
CREATE TABLE IF NOT EXISTS "Reservations_details" (
    "id" SERIAL PRIMARY KEY,
    "Res_id" INTEGER,
    "NoofRooms" VARCHAR(50),
    "RoomType" VARCHAR(255),
    "Checkindate" VARCHAR(100),
    "Checkoutdate" VARCHAR(100),
    "Netprice" VARCHAR(50),
    "RoomTotal" VARCHAR(50),
    "ExtrasTotal" VARCHAR(50),
    "MealTotal" VARCHAR(50),
    "Total" VARCHAR(50),
    "TaxIncluded" VARCHAR(50),
    "TaxExcluded" VARCHAR(50),
    "rate_name" VARCHAR(255),
    "rate_id" VARCHAR(100),
    "Availability_id" VARCHAR(100),
    "Availability_name" VARCHAR(255),
    "Room_Id" VARCHAR(100),
    "Room_Name" VARCHAR(255),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_res_details_resid ON "Reservations_details" ("Res_id");

-- 4. Reservation Customer Info (Guest Name, Contact, Address)
CREATE TABLE IF NOT EXISTS "Reservation_Customer" (
    "id" SERIAL PRIMARY KEY,
    "Res_id" INTEGER,
    "FirstName" VARCHAR(255),
    "LastName" VARCHAR(255),
    "Email" VARCHAR(255),
    "Tel" VARCHAR(100),
    "address" TEXT,
    "zip" VARCHAR(50),
    "Location" VARCHAR(255),
    "Country" VARCHAR(100),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_res_customer_resid ON "Reservation_Customer" ("Res_id");

-- 5. Reservation Per-Day breakdown
CREATE TABLE IF NOT EXISTS "Reservation_PerDay_details" (
    "id" SERIAL PRIMARY KEY,
    "Hotel_Code" VARCHAR(100),
    "Booking_Id" VARCHAR(100),
    "Date" VARCHAR(100),
    "rm_no" VARCHAR(100),
    "Price" VARCHAR(100),
    "Res_id" INTEGER,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_res_perday_resid ON "Reservation_PerDay_details" ("Res_id");

-- 6. MarkSend Response Logs
CREATE TABLE IF NOT EXISTS "MarkSend_Response" (
    "id" SERIAL PRIMARY KEY,
    "Hotel_Code" VARCHAR(100),
    "Booking_id" VARCHAR(100),
    "Service" VARCHAR(255),
    "PnrID" VARCHAR(100),
    "Message" TEXT,
    "Type" VARCHAR(20),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Room Availability Chart
CREATE TABLE IF NOT EXISTS "trans_roomavailability_chart_datewise" (
    "avaidd" SERIAL PRIMARY KEY,
    "hotelcode" VARCHAR(100),
    "allotcode" VARCHAR(100),
    "fromdate" VARCHAR(100),
    "todate" VARCHAR(100),
    "Availablerooms" VARCHAR(50),
    "stopsales" VARCHAR(50) DEFAULT '0',
    "uploadflg" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_avail_upload ON "trans_roomavailability_chart_datewise" ("uploadflg", "hotelcode");

-- 8. Room Rate Updates
CREATE TABLE IF NOT EXISTS "Trans_roomrateupdates_datewise" (
    "rmrateid" SERIAL PRIMARY KEY,
    "hotelcode" VARCHAR(100),
    "rateid" VARCHAR(100),
    "fromdate" VARCHAR(100),
    "todate" VARCHAR(100),
    "cancelpolicyid" VARCHAR(100),
    "paymentpolicyid" VARCHAR(100),
    "singlerent" VARCHAR(50),
    "doublerent" VARCHAR(50),
    "triplerent" VARCHAR(50),
    "Quartertriplerent" VARCHAR(50),
    "uploadflg" INTEGER DEFAULT 0,
    "notuploadflg" INTEGER DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rate_upload ON "Trans_roomrateupdates_datewise" ("uploadflg", "notuploadflg", "hotelcode");

-- 9. Audit Log tables
CREATE TABLE IF NOT EXISTS "Reservations_log" (
    "id" SERIAL PRIMARY KEY,
    "Hotel_Code" VARCHAR(100),
    "Booking_Id" VARCHAR(100),
    "syncType" VARCHAR(50),
    "PnrID" VARCHAR(100),
    "ExternalReference" VARCHAR(255),
    "ExternalReservationRoomId" VARCHAR(100),
    "ExternalReservationId" VARCHAR(100),
    "deposit" VARCHAR(100),
    "Service" VARCHAR(255),
    "TravelagentName" VARCHAR(255),
    "UpdateDate" VARCHAR(100),
    "modifyDate" VARCHAR(100),
    "cancelDate" VARCHAR(100),
    "Currency" VARCHAR(20),
    "Status" VARCHAR(50),
    "Adult" VARCHAR(20),
    "ChildB" VARCHAR(20),
    "ChildA" VARCHAR(20),
    "Infant" VARCHAR(20),
    "Remarks" TEXT,
    "Insertdate" VARCHAR(100),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Reservations_details_log" (
    "id" SERIAL PRIMARY KEY,
    "Res_id" INTEGER,
    "NoofRooms" VARCHAR(50),
    "RoomType" VARCHAR(255),
    "Checkindate" VARCHAR(100),
    "Checkoutdate" VARCHAR(100),
    "Netprice" VARCHAR(50),
    "RoomTotal" VARCHAR(50),
    "ExtrasTotal" VARCHAR(50),
    "MealTotal" VARCHAR(50),
    "Total" VARCHAR(50),
    "TaxIncluded" VARCHAR(50),
    "TaxExcluded" VARCHAR(50),
    "rate_name" VARCHAR(255),
    "rate_id" VARCHAR(100),
    "Availability_id" VARCHAR(100),
    "Availability_name" VARCHAR(255),
    "Room_Id" VARCHAR(100),
    "Room_Name" VARCHAR(255),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Reservation_Customer_log" (
    "id" SERIAL PRIMARY KEY,
    "Res_id" INTEGER,
    "FirstName" VARCHAR(255),
    "LastName" VARCHAR(255),
    "Email" VARCHAR(255),
    "Tel" VARCHAR(100),
    "address" TEXT,
    "zip" VARCHAR(50),
    "Location" VARCHAR(255),
    "Country" VARCHAR(100),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Reservation_PerDay_details_log" (
    "id" SERIAL PRIMARY KEY,
    "Hotel_Code" VARCHAR(100),
    "Booking_Id" VARCHAR(100),
    "Date" VARCHAR(100),
    "rm_no" VARCHAR(100),
    "Price" VARCHAR(100),
    "Res_id" INTEGER,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
