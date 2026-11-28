import re
text = '12 drummers drumming, 11 pipers piping, 10 lords a-leaping'
nums = re.findall(r'\d+', text)
print(nums)
