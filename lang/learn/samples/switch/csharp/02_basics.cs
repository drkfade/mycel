// Classes, properties, and methods in C#
using System;

class InvoiceItem {
  public string Name { get; }
  public int Qty { get; set; }
  public double UnitPrice { get; }

  public InvoiceItem(string name, int qty, double unitPrice) {
    Name = name;
    Qty = qty;
    UnitPrice = unitPrice;
  }

  public double Total() => Qty * UnitPrice;
}

var item = new InvoiceItem("Notebook", 3, 4.5);
Console.WriteLine($"{item.Name}: {item.Total():F2}");
double Discount(double amount, double rate = 0.1) => amount * (1.0 - rate);
Console.WriteLine($"after discount: {Discount(item.Total()):F2}");
