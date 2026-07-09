import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function createUser() {
  const email = "test@example.com";
  const password = "password123";
  const name = "Test User";

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create the user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
      },
    });

    console.log("User created successfully:");
    console.log({
      id: user.id,
      email: user.email,
      name: user.name,
      password: "[HASHED]",
    });
    console.log("\nYou can now login with:");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
  } catch (error: any) {
    if (error?.code === "P2002") {
      console.error("User with this email already exists!");
    } else {
      console.error("Error creating user:", error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createUser();
