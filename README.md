# adso-js

a small interpreter for the following program:

    int factorial(int n) {
      if (n < 1) {
        return 1;
      }
      return n * factorial(n - 1);
    }
    
    void main() {
      print(factorial(5));
    }

to run:

    node adso.js <script>

to run the example:

    node adso.js example.as
